require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

/**
 * COMPREHENSIVE FIX: Recalculate correct inventory for ALL products with GoodsReceipts.
 * 
 * Strategy: Instead of trying to reverse individual buggy transactions (which may
 * have been partially corrected by manual adjustments), we directly calculate the
 * correct expected inventory and set QuantityOnHand to that value.
 * 
 * Correct Expected = Initial_Import + Correct_GR_SQM - Confirmed_Sales
 * 
 * For tile products, GR contribution = quantityreceived as-is when unit is SQM
 * (the bug was converting SQM -> PCS -> back, inflating by 1/sqmPerPiece)
 */
async function fixAllGRInventory() {
    const client = await pool.connect();
    try {
        console.log('=== COMPREHENSIVE FIX: All GR Products ===\n');

        const parseDimensions = (str) => {
            if (!str) return 0;
            const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
            if (match) return (parseInt(match[1]) * parseInt(match[2])) / 10000;
            return 0;
        };

        // Get all products with GoodsReceipts
        const productsQuery = `
            SELECT DISTINCT p.productid, p.productname, p.size, p.qteparcolis, p.qtecolisparpalette,
                   pu.unitcode as primary_unit_code
            FROM Products p
            JOIN GoodsReceiptItems gri ON p.productid = gri.productid
            LEFT JOIN Units pu ON p.primaryunitid = pu.unitid
            WHERE p.isactive = true
            ORDER BY p.productid
        `;
        const products = await client.query(productsQuery);
        console.log(`Found ${products.rows.length} products with GoodsReceipts\n`);

        await client.query('BEGIN');

        let fixCount = 0;
        let skipCount = 0;
        let fixes = [];

        for (const prod of products.rows) {
            const sqmPerPiece = parseDimensions(prod.size || prod.productname);
            const isFiche = (prod.productname || '').toLowerCase().startsWith('fiche');
            const isTile = !isFiche && sqmPerPiece > 0;

            // 1. Get initial import amount
            const importResult = await client.query(`
                SELECT COALESCE(SUM(quantity), 0) as import_qty 
                FROM InventoryTransactions 
                WHERE productid = $1 AND referencetype = 'IMPORT_CSV'
            `, [prod.productid]);
            const importQty = parseFloat(importResult.rows[0].import_qty);

            // 2. Get ALL GoodsReceipt items with their units
            const grItems = await client.query(`
                SELECT gri.quantityreceived, u.unitcode
                FROM GoodsReceiptItems gri
                LEFT JOIN Units u ON gri.unitid = u.unitid
                WHERE gri.productid = $1
            `, [prod.productid]);

            // Calculate correct GR contribution
            let correctGRTotal = 0;
            for (const gri of grItems.rows) {
                const qtyReceived = parseFloat(gri.quantityreceived);
                const unitCode = (gri.unitcode || '').toUpperCase();
                const isGRinSQM = ['SQM', 'M2', 'M²'].includes(unitCode);
                const isGRinPCS = ['PCS', 'PIECE', 'PIÈCE'].includes(unitCode);
                const ppc = parseFloat(prod.qteparcolis) || 0;
                const cpp = parseFloat(prod.qtecolisparpalette) || 0;

                if (isTile) {
                    // Tile products → inventory in SQM
                    if (isGRinSQM) {
                        correctGRTotal += qtyReceived; // Keep as-is
                    } else if (isGRinPCS) {
                        correctGRTotal += qtyReceived * sqmPerPiece; // Convert PCS→SQM
                    } else if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode)) {
                        const pcs = ppc > 0 ? qtyReceived * ppc : qtyReceived;
                        correctGRTotal += pcs * sqmPerPiece;
                    } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode)) {
                        const boxes = cpp > 0 ? qtyReceived * cpp : qtyReceived;
                        const pcs = ppc > 0 ? boxes * ppc : boxes;
                        correctGRTotal += pcs * sqmPerPiece;
                    } else {
                        correctGRTotal += qtyReceived;
                    }
                } else {
                    // Non-tile → inventory in PrimaryUnit (usually PCS)
                    correctGRTotal += qtyReceived;
                }
            }

            // 3. Get confirmed/delivered sales
            const salesResult = await client.query(`
                SELECT COALESCE(SUM(oi.quantity), 0) as total_sold
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE oi.productid = $1 AND o.status IN ('CONFIRMED', 'DELIVERED')
            `, [prod.productid]);
            const totalSold = parseFloat(salesResult.rows[0].total_sold);

            // 4. Calculate correct expected
            const correctExpected = importQty + correctGRTotal - totalSold;

            // 5. Get current inventory
            const invResult = await client.query(`
                SELECT inventoryid, quantityonhand
                FROM Inventory
                WHERE productid = $1 AND ownershiptype = 'OWNED' AND factoryid IS NULL
            `, [prod.productid]);

            if (invResult.rows.length === 0) {
                continue;
            }

            const currentQty = parseFloat(invResult.rows[0].quantityonhand);
            const inventoryId = invResult.rows[0].inventoryid;
            const diff = currentQty - correctExpected;

            if (Math.abs(diff) < 0.5) {
                skipCount++;
                continue;
            }

            // Don't set below 0 — if expected is negative, something else is wrong
            const newQty = Math.max(0, correctExpected);
            const correction = newQty - currentQty;

            console.log(`[FIX] [${prod.productid}] ${prod.productname}`);
            console.log(`  Import: ${importQty.toFixed(2)} + GR_Correct: ${correctGRTotal.toFixed(2)} - Sold: ${totalSold.toFixed(2)} = Expected: ${correctExpected.toFixed(2)}`);
            console.log(`  Current: ${currentQty.toFixed(2)} → New: ${newQty.toFixed(2)} (correction: ${correction > 0 ? '+' : ''}${correction.toFixed(2)})`);

            // Apply fix
            await client.query(`
                UPDATE Inventory SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP
                WHERE InventoryID = $2
            `, [newQty, inventoryId]);

            // Recalculate packing
            const ppc = parseFloat(prod.qteparcolis) || 0;
            const cpp = parseFloat(prod.qtecolisparpalette) || 0;
            const newColis = ppc > 0 ? parseFloat((newQty / ppc).toFixed(4)) : 0;
            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
            await client.query(`
                UPDATE Inventory SET ColisCount = $1, PalletCount = $2
                WHERE InventoryID = $3
            `, [newColis, newPallets, inventoryId]);

            // Log the correction
            await client.query(`
                INSERT INTO InventoryTransactions 
                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 
                        'Fix: Recalculated from Import + Correct_GR_SQM - Sales (GR unit conversion bug fix)',
                        7, 'OWNED')
            `, [prod.productid, correction]);

            fixCount++;
            fixes.push({ productId: prod.productid, name: prod.productname, was: currentQty, now: newQty, correction });
        }

        console.log(`\n===== SUMMARY =====`);
        console.log(`Products checked: ${products.rows.length}`);
        console.log(`Fixed: ${fixCount}`);
        console.log(`Already correct: ${skipCount}`);

        await client.query('COMMIT');
        console.log('\n✅ All fixes COMMITTED!');

        // Refresh materialized view
        console.log('Refreshing mv_Catalogue...');
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        // Print fix table
        if (fixes.length > 0) {
            console.log('\n--- ALL FIXES APPLIED ---');
            for (const f of fixes) {
                console.log(`  [${f.productId}] ${f.name}: ${f.was.toFixed(2)} → ${f.now.toFixed(2)} (${f.correction > 0 ? '+' : ''}${f.correction.toFixed(2)})`);
            }
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR — rolled back:", e);
    } finally {
        client.release();
        pool.end();
    }
}

fixAllGRInventory();

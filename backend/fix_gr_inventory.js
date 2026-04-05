require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

/**
 * Fix inventory for products affected by the GoodsReceipt unit conversion bug.
 * 
 * The bug: When receiving tile products in SQM, the old code converted SQM->PCS->SQM,
 * effectively multiplying by (1/sqmPerPiece) * sqmPerPiece... except when PrimaryUnit=PCS,
 * it converted SQM to PCS, inflating the inventory by (1/sqmPerPiece).
 * 
 * Fix: For each GR item, recalculate what the correct inventory addition should have been
 * vs what was actually added, then correct the difference.
 */
async function fixGRInventory() {
    const client = await pool.connect();
    try {
        console.log('=== FIX GR INVENTORY: Correcting unit conversion bug ===\n');

        // Helper
        const parseDimensions = (str) => {
            if (!str) return 0;
            const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
            if (match) return (parseInt(match[1]) * parseInt(match[2])) / 10000;
            return 0;
        };

        // Find all GR items with their product info and the IN transaction
        const query = `
            SELECT 
                gri.receiptitemid,
                gri.receiptid,
                gri.productid,
                gri.quantityreceived,
                gri.unitid,
                u.unitcode as gr_unit,
                p.productname,
                p.size,
                p.primaryunitid,
                pu.unitcode as primary_unit_code,
                p.qteparcolis,
                p.qtecolisparpalette,
                it.transactionid,
                it.quantity as qty_added_to_inventory,
                gr.createdat as gr_date
            FROM GoodsReceiptItems gri
            JOIN GoodsReceipts gr ON gri.receiptid = gr.receiptid
            JOIN Products p ON gri.productid = p.productid
            LEFT JOIN Units u ON gri.unitid = u.unitid
            LEFT JOIN Units pu ON p.primaryunitid = pu.unitid
            LEFT JOIN InventoryTransactions it ON it.productid = gri.productid 
                AND it.referencetype = 'GOODS_RECEIPT' 
                AND it.referenceid::text = gri.receiptid::text
                AND it.transactiontype = 'IN'
            WHERE p.isactive = true
            AND gr.createdat >= '2026-03-05'
            ORDER BY gri.receiptid, gri.receiptitemid
        `;

        const result = await client.query(query);
        console.log(`Found ${result.rows.length} GR items to check\n`);

        let fixCount = 0;
        let skipCount = 0;
        let fixes = [];

        await client.query('BEGIN');

        for (const row of result.rows) {
            const qtyReceived = parseFloat(row.quantityreceived);
            const qtyAddedToInventory = parseFloat(row.qty_added_to_inventory || 0);
            const unitCode = (row.gr_unit || '').toUpperCase();
            const primaryUnitCode = (row.primary_unit_code || '').toUpperCase();
            const sqmPerPiece = parseDimensions(row.size || row.productname);
            const isFiche = (row.productname || '').toLowerCase().startsWith('fiche');
            const isTile = !isFiche && sqmPerPiece > 0;
            const isReceivingInSQM = ['SQM', 'M2', 'M²'].includes(unitCode);

            // Calculate the CORRECT quantity that should have been added
            let correctQty = qtyReceived;
            if (isTile) {
                if (isReceivingInSQM) {
                    correctQty = qtyReceived; // Should keep as-is
                } else if (['PCS', 'PIECE', 'PIÈCE'].includes(unitCode)) {
                    correctQty = qtyReceived * sqmPerPiece;
                }
                // BOX/PALLET cases would need piecesPerBox etc. but less common for initial fix
            }

            const diff = qtyAddedToInventory - correctQty;

            if (Math.abs(diff) < 0.01) {
                skipCount++;
                continue;
            }

            // This GR item added too much (or too little) to inventory
            const correction = -diff; // negative if we need to remove excess

            console.log(`[FIX] Product ${row.productid} ${row.productname} (GR ${row.receiptid})`);
            console.log(`  GR received: ${qtyReceived} ${unitCode} | Added to inventory: ${qtyAddedToInventory.toFixed(2)} | Correct: ${correctQty.toFixed(2)} | Correction: ${correction.toFixed(2)}`);

            // Apply correction to inventory
            await client.query(`
                UPDATE Inventory 
                SET QuantityOnHand = QuantityOnHand + $1,
                    UpdatedAt = CURRENT_TIMESTAMP
                WHERE ProductID = $2 AND OwnershipType = 'OWNED' AND FactoryID IS NULL
            `, [correction, row.productid]);

            // Recalculate packing counts
            const invResult = await client.query(`
                SELECT QuantityOnHand FROM Inventory 
                WHERE ProductID = $1 AND OwnershipType = 'OWNED' AND FactoryID IS NULL
            `, [row.productid]);

            if (invResult.rows.length > 0) {
                const newQty = parseFloat(invResult.rows[0].quantityonhand) || 0;
                const ppc = parseFloat(row.qteparcolis) || 0;
                const cpp = parseFloat(row.qtecolisparpalette) || 0;
                const newColis = ppc > 0 ? parseFloat((newQty / ppc).toFixed(4)) : 0;
                const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
                await client.query(`
                    UPDATE Inventory SET ColisCount = $1, PalletCount = $2
                    WHERE ProductID = $3 AND OwnershipType = 'OWNED' AND FactoryID IS NULL
                `, [newColis, newPallets, row.productid]);
            }

            // Update the inventory transaction to reflect correct amount
            if (row.transactionid) {
                await client.query(`
                    UPDATE InventoryTransactions SET Quantity = $1
                    WHERE TransactionID = $2
                `, [correctQty, row.transactionid]);
            }

            // Log correction transaction
            await client.query(`
                INSERT INTO InventoryTransactions 
                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 
                        'Fix: GoodsReceipt unit conversion bug - correcting SQM/PCS inflation', 
                        7, 'OWNED')
            `, [row.productid, correction]);

            fixCount++;
            fixes.push({
                productId: row.productid,
                name: row.productname,
                grReceived: qtyReceived,
                wasAdded: qtyAddedToInventory,
                correctQty: correctQty,
                correction: correction
            });
        }

        console.log(`\n===== SUMMARY =====`);
        console.log(`GR items checked: ${result.rows.length}`);
        console.log(`Fixed: ${fixCount}`);
        console.log(`Already correct: ${skipCount}`);

        await client.query('COMMIT');
        console.log('\n✅ All fixes COMMITTED!');

        // Refresh materialized view
        console.log('Refreshing mv_Catalogue...');
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        // Verification
        if (fixes.length > 0) {
            console.log('\n--- VERIFICATION ---');
            const fixedIds = fixes.map(f => f.productId);
            const verify = await pool.query(`
                SELECT i.productid, p.productname, i.quantityonhand, i.coliscount, i.palletcount
                FROM Inventory i
                JOIN Products p ON i.productid = p.productid
                WHERE i.productid = ANY($1) AND i.ownershiptype = 'OWNED' AND i.factoryid IS NULL
                ORDER BY i.productid
            `, [fixedIds]);
            for (const row of verify.rows) {
                console.log(`  [${row.productid}] ${row.productname}: qty=${row.quantityonhand}, colis=${row.coliscount}, pallets=${row.palletcount}`);
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

fixGRInventory();

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixAllInventory() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find ALL products that have GoodsReceiptItems
        // Correct formula: inventory = GR received - Sales (from confirmed orders)
        // We ignore InventoryTransactions completely and recalculate from source of truth
        const query = `
            WITH gr_totals AS (
                SELECT 
                    gri.productid,
                    SUM(gri.quantityreceived) as total_received
                FROM GoodsReceiptItems gri
                GROUP BY gri.productid
            ),
            sales_totals AS (
                SELECT 
                    oi.productid,
                    COALESCE(SUM(oi.quantity), 0) as total_sold
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE o.status NOT IN ('CANCELLED', 'PENDING')
                GROUP BY oi.productid
            ),
            current_inv AS (
                SELECT 
                    i.inventoryid,
                    i.productid,
                    i.quantityonhand as current_qty
                FROM Inventory i
                WHERE i.ownershiptype = 'OWNED' AND i.factoryid IS NULL
            )
            SELECT 
                p.productid,
                p.productname,
                p.primaryunitid,
                u.unitcode as primary_unit_code,
                p.qteparcolis,
                p.qtecolisparpalette,
                p.size,
                COALESCE(gr.total_received, 0) as total_received,
                COALESCE(st.total_sold, 0) as total_sold,
                COALESCE(ci.current_qty, 0) as current_qty,
                ci.inventoryid,
                (COALESCE(gr.total_received, 0) - COALESCE(st.total_sold, 0)) as expected_qty
            FROM Products p
            JOIN gr_totals gr ON p.productid = gr.productid
            LEFT JOIN sales_totals st ON p.productid = st.productid
            LEFT JOIN current_inv ci ON p.productid = ci.productid
            LEFT JOIN Units u ON p.primaryunitid = u.unitid
            WHERE p.isactive = true
            ORDER BY p.productid
        `;

        const result = await client.query(query);

        let fixCount = 0;
        let skipCount = 0;
        let results = [];

        for (const row of result.rows) {
            const currentQty = parseFloat(row.current_qty || 0);
            const expectedQty = parseFloat(row.expected_qty);
            const diff = Math.abs(currentQty - expectedQty);

            // Skip if difference is negligible (< 0.5 for real products, < 0.01 for fiches)
            const isFiche = (row.productname || '').toLowerCase().startsWith('fiche');
            const threshold = isFiche ? 0.01 : 0.5;

            if (diff <= threshold) {
                skipCount++;
                continue;
            }

            // Skip if no inventory record exists
            if (!row.inventoryid) {
                console.log(`  ⚠️ [${row.productid}] ${row.productname} — No inventory record, skipping`);
                continue;
            }

            // Calculate new colis and pallets
            const ppc = parseFloat(row.qteparcolis) || 0;
            const cpp = parseFloat(row.qtecolisparpalette) || 0;
            const newColis = ppc > 0 ? parseFloat((expectedQty / ppc).toFixed(4)) : 0;
            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

            // Apply fix
            await client.query(`
                UPDATE Inventory SET 
                    QuantityOnHand = $1,
                    QuantityReserved = 0,
                    ColisCount = $2,
                    PalletCount = $3,
                    UpdatedAt = CURRENT_TIMESTAMP
                WHERE inventoryid = $4
            `, [expectedQty, newColis, newPallets, row.inventoryid]);

            // Log adjustment transaction
            const adjustmentQty = expectedQty - currentQty;
            await client.query(`
                INSERT INTO InventoryTransactions 
                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 
                        'Bulk fix: Recalculated from GoodsReceipts minus Sales to correct unit conversion and cleanup script errors', 
                        7, 'OWNED')
            `, [row.productid, adjustmentQty]);

            fixCount++;
            const arrow = currentQty > expectedQty ? '↓' : '↑';
            console.log(`  ✅ [${row.productid}] ${row.productname}: ${currentQty.toFixed(2)} ${arrow} ${expectedQty.toFixed(2)} (diff: ${adjustmentQty.toFixed(2)})`);

            results.push({
                productid: row.productid,
                name: row.productname,
                oldQty: currentQty,
                newQty: expectedQty,
                adjustment: adjustmentQty,
                newColis: newColis,
                newPallets: newPallets
            });
        }

        console.log(`\n===== SUMMARY =====`);
        console.log(`Total products scanned: ${result.rows.length}`);
        console.log(`Products fixed: ${fixCount}`);
        console.log(`Products skipped (no discrepancy): ${skipCount}`);

        await client.query('COMMIT');
        console.log('\n✅ All fixes COMMITTED!');

        // Refresh materialized view
        console.log('Refreshing mv_Catalogue...');
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        // Verification: show all products that were fixed
        if (results.length > 0) {
            console.log('\n--- VERIFICATION ---');
            const fixedIds = results.map(r => r.productid);
            const verify = await pool.query(`
                SELECT i.productid, p.productname, i.quantityonhand, i.coliscount, i.palletcount
                FROM Inventory i
                JOIN Products p ON i.productid = p.productid
                WHERE i.productid = ANY($1)
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

fixAllInventory();

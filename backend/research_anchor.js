const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function research() {
    try {
        console.log('--- Testing Reconciliation Formula ---');
        console.log('Formula: Anchor (Sync update, April 7) + Purchases (Apr 6-17) - Sales (Apr 6-17)\n');

        // Sample products: STANLY (4945) and BARCELONA (3549)
        const testIds = [4945, 3549];

        for (const pid of testIds) {
            console.log(`Analyzing Product ID: ${pid}`);

            // 1. Get Anchor
            const anchorRes = await pool.query(`
                SELECT Quantity, CreatedAt, Notes 
                FROM InventoryTransactions 
                WHERE ProductID = $1 AND Notes ILIKE '%Sync update%'
                ORDER BY CreatedAt ASC LIMIT 1
            `, [pid]);

            if (anchorRes.rows.length === 0) {
                console.log('  Anchor MISSING for this product.');
                continue;
            }

            const anchor = anchorRes.rows[0];
            const anchorQty = parseFloat(anchor.quantity);
            console.log(`  Anchor Quantity: ${anchorQty} (Found on ${anchor.createdat})`);

            // 2. Get Purchases (Apr 06 - Apr 17)
            const purRes = await pool.query(`
                SELECT SUM(it.Quantity) as total
                FROM InventoryTransactions it
                WHERE it.ProductID = $1 
                  AND it.TransactionType = 'IN'
                  AND it.ReferenceType = 'GOODS_RECEIPT'
                  AND it.CreatedAt >= '2026-04-06 00:00:00'
                  AND it.CreatedAt <= '2026-04-17 23:59:59'
            `, [pid]);
            const totalPurchases = parseFloat(purRes.rows[0].total) || 0;

            // 3. Get Sales (Apr 06 - Apr 17)
            const salRes = await pool.query(`
                SELECT SUM(it.Quantity) as total
                FROM InventoryTransactions it
                WHERE it.ProductID = $1 
                  AND it.TransactionType = 'OUT'
                  AND it.ReferenceType = 'ORDER'
                  AND it.CreatedAt >= '2026-04-06 00:00:00'
                  AND it.CreatedAt <= '2026-04-17 23:59:59'
            `, [pid]);
            const totalSales = parseFloat(salRes.rows[0].total) || 0;

            const targetQty = anchorQty + totalPurchases - totalSales;

            console.log(`  Purchases (Apr 6-17): +${totalPurchases}`);
            console.log(`  Sales (Apr 6-17): -${totalSales}`);
            console.log(`  RESULT (Target Inventory): ${targetQty.toFixed(4)}`);

            const current = await pool.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1', [pid]);
            console.log(`  Current DB Value: ${current.rows[0].quantityonhand}`);
            console.log(`  Adjustment Needed: ${(targetQty - current.rows[0].quantityonhand).toFixed(4)}`);
            console.log('-----------------------------------');
        }

        // Global stats
        const globalAnchor = await pool.query("SELECT COUNT(DISTINCT ProductID) as count FROM InventoryTransactions WHERE Notes ILIKE '%Sync update%'");
        console.log(`Total Products with 'Sync update' anchor: ${globalAnchor.rows[0].count}`);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

research();

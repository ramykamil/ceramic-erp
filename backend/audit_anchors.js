const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function auditAnchors() {
    try {
        console.log('--- Auditing April 7 "Sync update" Anchors ---');

        // Total products in inventory
        const totalProducts = await pool.query('SELECT COUNT(*) FROM Inventory');
        console.log(`Total active products in inventory: ${totalProducts.rows[0].count}`);

        // Products with the anchor
        const anchorRes = await pool.query(`
            SELECT COUNT(DISTINCT ProductID) as count
            FROM InventoryTransactions
            WHERE Notes ILIKE '%Sync update%'
              AND CreatedAt >= '2026-04-06' AND CreatedAt <= '2026-04-08'
        `);
        console.log(`Products WITH 'Sync update' anchor (Apr 6-8): ${anchorRes.rows[0].count}`);

        // Sample of missing products
        const missingRes = await pool.query(`
            SELECT ProductID, ProductName
            FROM Products
            WHERE ProductID NOT IN (
                SELECT DISTINCT ProductID
                FROM InventoryTransactions
                WHERE Notes ILIKE '%Sync update%'
                  AND CreatedAt >= '2026-04-06' AND CreatedAt <= '2026-04-08'
            )
            AND IsActive = TRUE
            LIMIT 10
        `);
        console.log('\nSample of products MISSING the anchor:');
        console.table(missingRes.rows);

        // Check Product 4945 specifically (STANLY MARFIL)
        const stanlyRes = await pool.query(`
            SELECT TransactionID, Quantity, Notes, CreatedAt
            FROM InventoryTransactions
            WHERE ProductID = 4945
            ORDER BY CreatedAt ASC LIMIT 20
        `);
        console.log('\nTransactions for STANLY MARFIL (4945):');
        console.table(stanlyRes.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

auditAnchors();

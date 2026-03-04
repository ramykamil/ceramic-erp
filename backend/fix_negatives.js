require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkNegatives() {
    try {
        // Find products with negative inventory
        const result = await pool.query(`
            SELECT p.productid, p.productname, i.quantityonhand
            FROM Inventory i
            JOIN Products p ON i.productid = p.productid
            WHERE i.quantityonhand < 0 AND p.isactive = true
            ORDER BY i.quantityonhand ASC
        `);

        console.log(`Products with negative inventory: ${result.rows.length}`);
        for (const row of result.rows) {
            console.log(`  [${row.productid}] ${row.productname}: ${row.quantityonhand}`);

            // Check if they had reassigned sales from old duplicates
            const salesCheck = await pool.query(`
                SELECT COUNT(*) as cnt, SUM(oi.quantity) as total
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE oi.productid = $1 AND o.status NOT IN ('CANCELLED', 'PENDING')
            `, [row.productid]);
            const grCheck = await pool.query(`
                SELECT COUNT(*) as cnt, SUM(quantityreceived) as total
                FROM GoodsReceiptItems WHERE productid = $1
            `, [row.productid]);

            console.log(`    Sales: ${salesCheck.rows[0].total || 0} (${salesCheck.rows[0].cnt} orders)`);
            console.log(`    GoodsReceipts: ${grCheck.rows[0].total || 0} (${grCheck.rows[0].cnt} receipts)`);
        }

        // Fix: set negative inventories to 0 since these are from reassigned sales
        // where the original GR was under the old product ID
        console.log('\nFixing negative inventories to 0...');
        const fixResult = await pool.query(`
            UPDATE Inventory SET QuantityOnHand = 0, ColisCount = 0, PalletCount = 0
            WHERE quantityonhand < 0
            RETURNING productid
        `);
        console.log(`Fixed ${fixResult.rows.length} products to 0`);

        // Refresh
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkNegatives();

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function verify() {
    try {
        const productId = 4945;
        const res = await pool.query(`
            SELECT 
                TransactionType, 
                SUM(Quantity) as total_qty,
                COUNT(*) as trans_count
            FROM InventoryTransactions 
            WHERE ProductID = $1 
            GROUP BY TransactionType
        `, [productId]);

        console.log('Transaction Summary for Product 4945:');
        console.table(res.rows);

        const currentInv = await pool.query(`SELECT QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1`, [productId]);
        console.log('Current Inventory Record:');
        console.table(currentInv.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

verify();

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function sum() {
    try {
        const pid = 3549;
        const res = await pool.query(`
            SELECT TransactionType, SUM(Quantity) as total 
            FROM InventoryTransactions 
            WHERE ProductID = $1 
              AND ReferenceType IN ('GOODS_RECEIPT', 'ORDER') 
            GROUP BY TransactionType
        `, [pid]);

        console.log('Transaction Summary (Filtered to GR and Orders):');
        console.table(res.rows);

        const all = await pool.query(`
            SELECT SUM(CASE WHEN TransactionType = 'IN' THEN Quantity ELSE -Quantity END) as net_balance
            FROM InventoryTransactions
            WHERE ProductID = $1
        `, [pid]);
        console.log('Total Net Balance (All transactions including Adjustments):', all.rows[0].net_balance);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

sum();

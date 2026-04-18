const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function research() {
    try {
        console.log('--- Database Schema & Transaction Research ---');

        // 1. All available columns in Orders, PurchaseOrders, GoodsReceipts
        const tables = ['Orders', 'PurchaseOrders', 'GoodsReceipts', 'InventoryTransactions'];
        for (const table of tables) {
            const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
            console.log(`\nColumns in ${table}:`);
            console.log(cols.rows.map(r => r.column_name).join(', '));
        }

        // 2. Identify return transaction types specifically
        const returns = await pool.query(`
            SELECT DISTINCT ReferenceType, TransactionType 
            FROM InventoryTransactions 
            WHERE ReferenceType ILIKE '%RETURN%' OR Notes ILIKE '%RETOUR%'
        `);
        console.log('\nReturn Transactions:');
        console.table(returns.rows);

        // 3. Check for any status that indicates "Deleted" or "Cancelled" in Orders
        const statuses = await pool.query('SELECT DISTINCT Status FROM Orders');
        console.log('\nPossible Order Statuses:');
        console.table(statuses.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

research();

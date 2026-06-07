
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function listAllColumns() {
    try {
        const tables = ['products', 'inventory', 'purchaseorderitems', 'purchaseorders', 'inventorytransactions', 'orderitems', 'orders'];
        for (const table of tables) {
            const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [table]);
            console.log(`Columns in '${table}' table:`);
            console.log(res.rows.map(row => row.column_name).join(', '));
            console.log('---');
        }
    } catch (err) {
        console.error("Error listing columns:", err);
    } finally {
        await pool.end();
    }
}

listAllColumns();

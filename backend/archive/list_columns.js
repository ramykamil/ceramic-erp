
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function listColumns() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'products' ORDER BY ordinal_position");
        console.log("Columns in 'products' table:");
        res.rows.forEach(row => console.log(`- ${row.column_name}`));
    } catch (err) {
        console.error("Error listing columns:", err);
    } finally {
        await pool.end();
    }
}

listColumns();

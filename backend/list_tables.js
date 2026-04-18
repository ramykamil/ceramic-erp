
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function listTables() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
        console.log("Tables in public schema:");
        res.rows.forEach(row => console.log(`- ${row.table_name}`));
    } catch (err) {
        console.error("Error listing tables:", err);
    } finally {
        await pool.end();
    }
}

listTables();

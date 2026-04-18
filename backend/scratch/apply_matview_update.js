const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function apply() {
    const sql = fs.readFileSync(path.join(__dirname, '../CREATE_CATALOGUE_VIEW.sql'), 'utf8');
    const client = await pool.connect();
    try {
        console.log('Connecting to online database...');
        console.log('Using URL from .env_utf8');
        await client.query('BEGIN');
        console.log('Applying SQL changes for mv_Catalogue...');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✓ Successfully updated mv_Catalogue on online database.');
        
        // Quick verification
        const check = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'mv_catalogue' 
            AND column_name IN ('totalreserved', 'productid', 'totalqty')
            ORDER BY column_name;
        `);
        console.log('\nVerification of columns:');
        console.table(check.rows);
        
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ Failed to update database:', err);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}
apply();

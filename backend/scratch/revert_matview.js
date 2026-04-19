const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function revert() {
    console.log('Connecting to online database...');
    const sql = fs.readFileSync(path.join(__dirname, '../CREATE_CATALOGUE_VIEW.sql'), 'utf8');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Reverting mv_Catalogue to original state...');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✓ Successfully reverted mv_Catalogue to original state.');
        
        // Verification after revert
        const check = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'mv_catalogue' AND column_name = 'totalreserved'
        `);
        if (check.rows.length === 0) {
            console.log('✓ Verification: "totalreserved" column successfully removed.');
        } else {
            console.log('❌ Error: "totalreserved" column still exists.');
        }

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ Failed to revert database:', err);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}
revert();

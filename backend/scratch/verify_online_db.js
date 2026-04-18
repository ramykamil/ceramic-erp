const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function verify() {
    const client = await pool.connect();
    try {
        console.log('Fetching columns from mv_Catalogue...');
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'mv_Catalogue' -- Try capitalized
            OR table_name = 'mv_catalogue'
        `);
        
        if (res.rows.length === 0) {
             console.log('information_schema.columns returned nothing. Trying pg_attribute...');
             const res2 = await client.query(`
                SELECT a.attname as column_name
                FROM pg_catalog.pg_attribute a
                JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
                WHERE c.relname = 'mv_catalogue' AND a.attnum > 0 AND NOT a.attisdropped;
             `);
             console.table(res2.rows);
        } else {
            console.table(res.rows);
        }

        console.log('\nFetching one row to check data:');
        const data = await client.query('SELECT * FROM mv_Catalogue LIMIT 1');
        console.log(data.rows[0] ? '✓ Success: Row fetched' : '⚠ View is empty');
        if (data.rows[0]) {
            console.log('TotalReserved:', data.rows[0].totalreserved);
        }

    } catch (err) {
        console.error('❌ Verification failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}
verify();

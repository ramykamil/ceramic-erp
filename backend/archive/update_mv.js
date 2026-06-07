const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'ceramic_erp',
    user: 'postgres',
    password: 'postgres',
});

async function main() {
    const sql = fs.readFileSync('c:\\Users\\PC\\OneDrive\\Bureau\\ceramic-erp-platform\\backend\\CREATE_CATALOGUE_VIEW.sql', 'utf-8');
    try {
        await pool.query(sql);
        console.log("Materialized View Updated successfully.");
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();

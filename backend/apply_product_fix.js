const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function runFix() {
    const client = await pool.connect();
    try {
        console.log('Applying product precision fix...');

        // Read SQL file
        const sqlPath = path.join(__dirname, 'FIX_PRODUCT_PRECISION.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute SQL
        await client.query(sql);

        console.log('Fix applied successfully!');
    } catch (error) {
        console.error('Error applying fix:', error);
    } finally {
        client.release();
        pool.end();
    }
}

runFix();

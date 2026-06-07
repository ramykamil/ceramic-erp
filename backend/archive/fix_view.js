const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function run() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'CREATE_CATALOGUE_VIEW.sql'), 'utf8');
        await pool.query(sql);
        console.log('✅ View recreated successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error recreating view:', err);
        process.exit(1);
    }
}
run();

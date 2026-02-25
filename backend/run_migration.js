const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');

const run = async () => {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'ADD_PAYMENT_COLUMNS_TO_ORDERS.sql'), 'utf8');
        console.log('Running migration...');
        await pool.query(sql);
        console.log('Migration successful');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        // We can't easily close the pool if it creates it internally, but process.exit works.
        process.exit();
    }
};
run();

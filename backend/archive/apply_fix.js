const fs = require('fs');
const path = require('path');
// Adjust path to point to src/config/database.js
// We are in backend/src/scripts usually, or root of backend?
// Let's assume we run this from backend root.
// If run from /home/ramy/Desktop/ceramic-erp-platform, then strict path needed.

// Explicitly load .env from the backend directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Try to require the database config relative to where this script will be saved
// database.js at: src/config/database.js
const pool = require('./src/config/database');

async function runFix() {
    try {
        const sqlPath = path.join(__dirname, 'ADD_ORDER_ADDRESS.sql');
        console.log(`Reading SQL from: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Connecting to database...');
        const client = await pool.connect();

        try {
            console.log('Executing SQL fix...');
            await client.query(sql);
            console.log('✅ SUCCESS: Database has been updated to allow decimals.');
        } catch (err) {
            console.error('❌ SQL ERROR:', err.message);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('❌ SCRIPT ERROR:', err.message);
    } finally {
        // Close the pool to allow script to exit
        await pool.end();
    }
}

runFix();

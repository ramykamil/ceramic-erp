const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('--- Starting Transport Cost Migration ---');

        // Add DeliveryCost column
        console.log('Adding DeliveryCost column to PurchaseOrders...');
        await client.query(`
      ALTER TABLE PurchaseOrders 
      ADD COLUMN IF NOT EXISTS DeliveryCost DECIMAL(15,2) DEFAULT 0;
    `);

        console.log('✅ Migration Validated');
    } catch (err) {
        console.error('❌ Migration Failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();

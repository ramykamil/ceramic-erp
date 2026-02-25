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
        console.log('--- Starting Migration ---');

        // 1. Add BrandID column
        console.log('1. Adding BrandID column...');
        await client.query(`
      ALTER TABLE PurchaseOrders 
      ADD COLUMN IF NOT EXISTS BrandID INT REFERENCES Brands(BrandID);
    `);

        // 2. Make FactoryID NULLABLE (if not already)
        console.log('2. Altering FactoryID to be NULLABLE...');
        await client.query(`
      ALTER TABLE PurchaseOrders 
      ALTER COLUMN FactoryID DROP NOT NULL;
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

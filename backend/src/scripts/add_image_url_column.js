const { Pool } = require('pg');

// Using credentials from backend/.env
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ceramic_erp',
    password: 'postgres',
    port: 5432,
});

async function runMigration() {
    try {
        console.log('Adding ImageUrl column to products table...');
        // Use unquoted table name to match existing schema (likely lowercase 'products')
        await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS "ImageUrl" TEXT;
    `);
        console.log('Successfully added ImageUrl column.');
    } catch (error) {
        console.error('Error running migration:', error);
    } finally {
        await pool.end();
    }
}

runMigration();

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function updateSchema() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Modifying CustomerFactoryRules table...');

        // 1. Drop existing constraint and column
        await client.query(`
      ALTER TABLE CustomerFactoryRules 
      DROP CONSTRAINT IF EXISTS customerfactoryrules_factoryid_fkey;
    `);

        await client.query(`
      ALTER TABLE CustomerFactoryRules 
      DROP COLUMN IF EXISTS FactoryID;
    `);

        // 2. Add BrandID column
        await client.query(`
      ALTER TABLE CustomerFactoryRules 
      ADD COLUMN IF NOT EXISTS BrandID INT REFERENCES Brands(BrandID);
    `);

        // 3. Re-add Unique Constraint
        await client.query(`
      ALTER TABLE CustomerFactoryRules 
      DROP CONSTRAINT IF EXISTS customerfactoryrules_customerid_factoryid_size_key;
    `);

        await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_unique 
      ON CustomerFactoryRules(CustomerID, BrandID, Size);
    `);

        await client.query('COMMIT');
        console.log('Schema update completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating schema:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

updateSchema();

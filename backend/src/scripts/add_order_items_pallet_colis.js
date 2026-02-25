const pool = require('../config/database');

/**
 * Migration: Add PalletCount and ColisCount columns to OrderItems table
 */
async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Add PalletCount/ColisCount to OrderItems...');
        await client.query('BEGIN');

        // Add PalletCount column
        console.log('1. Adding PalletCount column...');
        await client.query(`
            ALTER TABLE OrderItems 
            ADD COLUMN IF NOT EXISTS PalletCount INTEGER DEFAULT 0
        `);

        // Add ColisCount column
        console.log('2. Adding ColisCount column...');
        await client.query(`
            ALTER TABLE OrderItems 
            ADD COLUMN IF NOT EXISTS ColisCount INTEGER DEFAULT 0
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();

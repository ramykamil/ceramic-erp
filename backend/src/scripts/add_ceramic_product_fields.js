const pool = require('../config/database');

/**
 * Migration: Add Ceramic-Specific Fields to Products table
 */
async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Add Ceramic fields to Products...');
        await client.query('BEGIN');

        // Add Calibre column (e.g., 'C1', '01')
        console.log('1. Adding Calibre column...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS Calibre VARCHAR(50)
        `);

        // Add Choix column (e.g., '1er Choix', 'MS')
        console.log('2. Adding Choix column...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS Choix VARCHAR(50)
        `);

        // Add QteParColis (quantity per box - m2 or pcs)
        console.log('3. Adding QteParColis column...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS QteParColis DECIMAL(10,4) DEFAULT 0
        `);

        // Add QteColisParPalette (boxes per pallet)
        console.log('4. Adding QteColisParPalette column...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS QteColisParPalette INTEGER DEFAULT 0
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

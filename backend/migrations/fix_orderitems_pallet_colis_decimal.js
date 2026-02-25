/**
 * Migration: Change PalletCount and ColisCount from INTEGER to NUMERIC
 * This fixes the error: "syntaxe en entrée invalide pour le type integer : « 0.36 »"
 */
const pool = require('../src/config/database');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Fix PalletCount/ColisCount decimal type...');
        await client.query('BEGIN');

        // Change PalletCount from INTEGER to NUMERIC(10,2)
        console.log('1. Converting PalletCount to NUMERIC(10,2)...');
        await client.query(`
            ALTER TABLE OrderItems 
            ALTER COLUMN PalletCount TYPE NUMERIC(10,2) USING PalletCount::NUMERIC(10,2)
        `);

        // Change ColisCount from INTEGER to NUMERIC(10,2)
        console.log('2. Converting ColisCount to NUMERIC(10,2)...');
        await client.query(`
            ALTER TABLE OrderItems 
            ALTER COLUMN ColisCount TYPE NUMERIC(10,2) USING ColisCount::NUMERIC(10,2)
        `);

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');
        console.log('   PalletCount and ColisCount now accept decimal values.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();

const pool = require('../config/database');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Add conversion and COGS fields...');
        await client.query('BEGIN');

        console.log('1. Adding BaseUnit column to Products...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS BaseUnit VARCHAR(50) DEFAULT 'SQM'
        `);

        console.log('2. Adding IsMeterBased column to Products...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS IsMeterBased BOOLEAN DEFAULT TRUE
        `);

        console.log('3. Adding AllowPieceSale column to Products...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS AllowPieceSale BOOLEAN DEFAULT TRUE
        `);

        console.log('4. Adding AllowCartonDisplay column to Products...');
        await client.query(`
            ALTER TABLE Products 
            ADD COLUMN IF NOT EXISTS AllowCartonDisplay BOOLEAN DEFAULT TRUE
        `);

        console.log('5. Adding CostAtSale column to OrderItems...');
        await client.query(`
            ALTER TABLE OrderItems 
            ADD COLUMN IF NOT EXISTS CostAtSale DECIMAL(12,2) DEFAULT 0.00
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

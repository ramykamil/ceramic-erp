
const pool = require('./src/config/database');

async function addBalanceColumns() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check and Add CurrentBalance to Brands
        const checkBrands = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'currentbalance'");
        if (checkBrands.rows.length === 0) {
            console.log('Adding CurrentBalance to Brands...');
            await client.query('ALTER TABLE Brands ADD COLUMN CurrentBalance NUMERIC(15, 2) DEFAULT 0.00');
        }

        // Check and Add CurrentBalance to Factories
        const checkFactories = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'factories' AND column_name = 'currentbalance'");
        if (checkFactories.rows.length === 0) {
            console.log('Adding CurrentBalance to Factories...');
            await client.query('ALTER TABLE Factories ADD COLUMN CurrentBalance NUMERIC(15, 2) DEFAULT 0.00');
        }

        await client.query('COMMIT');
        console.log('Balance columns added successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding columns:', error);
    } finally {
        client.release();
        pool.end();
    }
}

addBalanceColumns();

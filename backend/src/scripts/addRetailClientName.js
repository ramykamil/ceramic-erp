const pool = require('../config/database');

async function addRetailClientNameColumn() {
    const client = await pool.connect();

    try {
        console.log('Adding RetailClientName column to Orders table...');

        await client.query(`
      ALTER TABLE Orders 
      ADD COLUMN IF NOT EXISTS RetailClientName VARCHAR(255);
    `);

        console.log('✅ RetailClientName column added successfully!');

    } catch (error) {
        console.error('Error adding column:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addRetailClientNameColumn()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// Run this script to add CostPrice column to OrderItems table
const pool = require('./src/config/database');

async function migrate() {
    try {
        console.log('Adding CostPrice column to OrderItems...');

        await pool.query(`
      ALTER TABLE OrderItems ADD COLUMN IF NOT EXISTS CostPrice DECIMAL(15, 4) DEFAULT 0;
    `);

        console.log('✓ CostPrice column added successfully!');
        console.log('You can now restart the backend server.');

        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error.message);
        process.exit(1);
    }
}

migrate();

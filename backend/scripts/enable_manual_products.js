const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); // Adjust path if needed

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Starting migration...');
        await client.query('BEGIN');

        // 1. Ensure "MANUAL" product exists
        // We use a negative ID only if creating fresh, but better to let Serial handle it if we want valid FK.
        // Actually, ProductID is Serial. Let's insert if not exists.
        // We'll search by ProductCode 'MANUAL'.

        const checkProduct = await client.query("SELECT ProductID FROM Products WHERE ProductCode = 'MANUAL'");
        let manualProductId;

        if (checkProduct.rows.length === 0) {
            console.log('Creating generic MANUAL product...');
            // We need a dummy Category ID or NULL. Schema says CategoryID is optional? 
            // Checking schema: CategoryID INT REFERENCES Categories(CategoryID). nullable.
            // UnitID? PrimaryUnitID INT REFERENCES Units(UnitID). nullable.
            // We should probably find a unit 'PCS'.

            const unitRes = await client.query("SELECT UnitID FROM Units WHERE UnitCode = 'PCS'");
            const unitId = unitRes.rows.length > 0 ? unitRes.rows[0].unitid : null;

            const insertRes = await client.query(`
        INSERT INTO Products (
          ProductCode, ProductName, Description, BasePrice, IsActive, PrimaryUnitID
        ) VALUES (
          'MANUAL', 'Produit Manuel', 'Generic product for manual entry', 0, TRUE, $1
        ) RETURNING ProductID
      `, [unitId]);

            manualProductId = insertRes.rows[0].productid;
            console.log(`Created MANUAL product with ID: ${manualProductId}`);
        } else {
            manualProductId = checkProduct.rows[0].productid;
            console.log(`MANUAL product already exists with ID: ${manualProductId}`);
        }

        // 2. Add LinkProductName column to OrderItems if not exists
        console.log('Checking OrderItems table schema...');

        // Check if column exists
        const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orderitems' AND column_name='linkproductname'
    `);

        if (checkColumn.rows.length === 0) {
            console.log('Adding LinkProductName column to OrderItems...');
            await client.query(`
        ALTER TABLE OrderItems 
        ADD COLUMN LinkProductName VARCHAR(255)
      `);
            console.log('Column LinkProductName added.');
        } else {
            console.log('Column LinkProductName already exists.');
        }

        await client.query('COMMIT');
        console.log('Migration completed successfully.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();

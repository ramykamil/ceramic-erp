const pool = require('../config/database');

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Add Size column to Products if it doesn't exist
        console.log('Adding Size column to Products table...');
        await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='size') THEN
          ALTER TABLE Products ADD COLUMN Size VARCHAR(50);
        END IF;
      END
      $$;
    `);

        // 2. Populate Size column
        console.log('Populating Size column...');
        // Fetch all products
        const res = await client.query('SELECT ProductID, ProductName, Description FROM Products');
        for (const product of res.rows) {
            let size = 'Standard';
            const name = product.productname || '';
            const desc = product.description || '';
            const text = (name + ' ' + desc).toLowerCase();

            // Regex for common sizes like 60x60, 45x45, 120x60, 60x120
            const sizeMatch = text.match(/(\d{2,3})[xX*](\d{2,3})/);
            if (sizeMatch) {
                size = `${sizeMatch[1]}x${sizeMatch[2]}`;
            }

            await client.query('UPDATE Products SET Size = $1 WHERE ProductID = $2', [size, product.productid]);
        }

        // 3. Create CustomerFactoryPrices table
        console.log('Creating CustomerFactoryPrices table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS CustomerFactoryPrices (
        RuleID SERIAL PRIMARY KEY,
        CustomerID INT REFERENCES Customers(CustomerID) ON DELETE CASCADE,
        FactoryID INT REFERENCES Factories(FactoryID) ON DELETE CASCADE,
        Size VARCHAR(50) NOT NULL,
        Price DECIMAL(10, 2) NOT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(CustomerID, FactoryID, Size)
      );
    `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
    } finally {
        client.release();
        process.exit();
    }
}

runMigration();

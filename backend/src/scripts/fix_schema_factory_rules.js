const pool = require('../config/database');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Updating Products table...');
    // Add FactoryID if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='factoryid') THEN
          ALTER TABLE Products ADD COLUMN FactoryID INT REFERENCES Factories(FactoryID);
        END IF;
      END
      $$;
    `);

    // Ensure Size column exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='size') THEN
          ALTER TABLE Products ADD COLUMN Size VARCHAR(50);
        END IF;
      END
      $$;
    `);

    console.log('2. Creating CustomerFactoryRules table...');
    // Create CustomerFactoryRules table
    await client.query(`
      CREATE TABLE IF NOT EXISTS CustomerFactoryRules (
        RuleID SERIAL PRIMARY KEY,
        CustomerID INT REFERENCES Customers(CustomerID) ON DELETE CASCADE,
        FactoryID INT REFERENCES Factories(FactoryID),
        Size VARCHAR(50) NOT NULL,
        SpecificPrice DECIMAL(15,2) NOT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(CustomerID, FactoryID, Size)
      );
    `);

    console.log('3. Creating Index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rules_lookup ON CustomerFactoryRules(CustomerID, FactoryID, Size);
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

const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ceramic_erp',
    password: 'postgres',
    port: 5432,
});

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('Starting Phase 5 Migration...');
        await client.query('BEGIN');

        // 1. Add FactoryID to Brands
        console.log('Adding FactoryID to Brands table...');
        await client.query(`
      ALTER TABLE Brands 
      ADD COLUMN IF NOT EXISTS FactoryID INTEGER REFERENCES Factories(FactoryID);
    `);

        // 2. Create Settlements Table
        console.log('Creating Settlements table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS Settlements (
        SettlementID SERIAL PRIMARY KEY,
        FactoryID INTEGER REFERENCES Factories(FactoryID),
        StartDate DATE NOT NULL,
        EndDate DATE NOT NULL,
        TotalAmount DECIMAL(10, 2) NOT NULL,
        Status VARCHAR(20) DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'PAID')),
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // 3. Link existing Brands to the first Factory (Temporary fix for existing data)
        // We assume at least one factory exists from the seed.
        console.log('Linking existing brands to a default factory...');
        const factoryResult = await client.query('SELECT FactoryID FROM Factories LIMIT 1');
        if (factoryResult.rows.length > 0) {
            const factoryId = factoryResult.rows[0].factoryid;
            await client.query('UPDATE Brands SET FactoryID = $1 WHERE FactoryID IS NULL', [factoryId]);
        } else {
            console.warn('No factories found to link brands to. Please ensure factories exist.');
        }

        await client.query('COMMIT');
        console.log('Phase 5 Migration completed successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();

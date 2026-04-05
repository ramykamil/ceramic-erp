const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function updateSchema() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('1. Adding Type column to Warehouses...');
        await client.query(`
      ALTER TABLE Warehouses 
      ADD COLUMN IF NOT EXISTS Type VARCHAR(20) DEFAULT 'WHOLESALE' CHECK (Type IN ('WHOLESALE', 'RETAIL'));
    `);

        console.log('2. Updating Main Warehouse to WHOLESALE...');
        await client.query(`
      UPDATE Warehouses SET Type = 'WHOLESALE' WHERE WarehouseCode = 'WH-001';
    `);

        console.log('3. Creating Retail Warehouse (Showroom) if not exists...');
        await client.query(`
      INSERT INTO Warehouses (WarehouseCode, WarehouseName, Location, Type, IsActive)
      VALUES ('SH-001', 'Showroom Principal', 'City Center', 'RETAIL', TRUE)
      ON CONFLICT (WarehouseCode) DO NOTHING;
    `);

        console.log('4. Dropping and Recreating vw_CurrentInventory view...');
        await client.query('DROP VIEW IF EXISTS vw_CurrentInventory CASCADE');

        await client.query(`
      CREATE OR REPLACE VIEW vw_CurrentInventory AS
      SELECT 
          i.InventoryID,
          i.ProductID,
          i.WarehouseID,
          p.ProductCode,
          p.ProductName,
          b.BrandName,
          w.WarehouseName,
          w.Type as WarehouseType, -- <-- ADDED THIS
          i.OwnershipType,
          f.FactoryName,
          i.QuantityOnHand,
          i.QuantityReserved,
          i.QuantityAvailable,
          i.ReorderLevel,
          i.PalletCount,
          i.ColisCount
      FROM Inventory i
      JOIN Products p ON i.ProductID = p.ProductID
      JOIN Warehouses w ON i.WarehouseID = w.WarehouseID
      LEFT JOIN Brands b ON p.BrandID = b.BrandID
      LEFT JOIN Factories f ON i.FactoryID = f.FactoryID
      WHERE p.IsActive = TRUE;
    `);

        await client.query('COMMIT');
        console.log('Schema update completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating schema:', error);
    } finally {
        client.release();
        pool.end();
    }
}

updateSchema();

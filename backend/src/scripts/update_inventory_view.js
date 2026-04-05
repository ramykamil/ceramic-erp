const pool = require('../config/database');

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Updating vw_CurrentInventory view...');
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

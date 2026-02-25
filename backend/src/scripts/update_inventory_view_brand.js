const pool = require('../config/database');

async function updateView() {
    const client = await pool.connect();
    try {
        console.log('Updating vw_CurrentInventory...');
        await client.query('DROP VIEW IF EXISTS vw_CurrentInventory');
        await client.query(`
            CREATE OR REPLACE VIEW vw_CurrentInventory AS
            SELECT 
                i.InventoryID,
                i.ProductID,
                i.WarehouseID,
                p.ProductCode,
                p.ProductName,
                b.BrandName, -- <-- ADDED BRAND NAME
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
            LEFT JOIN Brands b ON p.BrandID = b.BrandID -- <-- JOIN BRANDS
            LEFT JOIN Factories f ON i.FactoryID = f.FactoryID
            WHERE p.IsActive = TRUE;
        `);
        console.log('View updated successfully.');
    } catch (error) {
        console.error('Error updating view:', error);
    } finally {
        client.release();
        pool.end();
    }
}

updateView();

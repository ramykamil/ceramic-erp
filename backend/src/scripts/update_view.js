const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const updateViewQuery = `
CREATE OR REPLACE VIEW vw_CurrentInventory AS
SELECT 
    i.InventoryID,
    i.ProductID,
    i.WarehouseID,
    p.ProductCode,
    p.ProductName,
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
LEFT JOIN Factories f ON i.FactoryID = f.FactoryID
WHERE p.IsActive = TRUE;
`;

async function run() {
    try {
        await client.connect();
        console.log('Connected to database.');
        await client.query(updateViewQuery);
        console.log('View vw_CurrentInventory updated successfully.');
    } catch (err) {
        console.error('Error updating view:', err);
    } finally {
        await client.end();
    }
}

run();

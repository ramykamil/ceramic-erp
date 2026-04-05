CREATE TABLE IF NOT EXISTS Inventory (
    InventoryID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    OwnershipType VARCHAR(20) NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID),
    QuantityOnHand DECIMAL(15,4) DEFAULT 0.00,
    QuantityReserved DECIMAL(15,4) DEFAULT 0.00,
    ReorderLevel DECIMAL(15,4) DEFAULT 0.00,
    MaxStockLevel DECIMAL(15,4),
    LastRestockedAt TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON Inventory(ProductID);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON Inventory(WarehouseID);


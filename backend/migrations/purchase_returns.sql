-- Create Sequence for Purchase Return Numbers
CREATE SEQUENCE IF NOT EXISTS purchase_returns_seq START 1;

-- Create PurchaseReturns Table
CREATE TABLE IF NOT EXISTS PurchaseReturns (
    ReturnID SERIAL PRIMARY KEY,
    ReturnNumber VARCHAR(50) UNIQUE NOT NULL,
    PurchaseOrderID INTEGER REFERENCES PurchaseOrders(PurchaseOrderID),
    FactoryID INTEGER REFERENCES Factories(FactoryID), -- Can be NULL if Brand, but for now we follow existing pattern
    BrandID INTEGER REFERENCES Brands(BrandID),
    ReturnDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED')),
    TotalAmount DECIMAL(10, 2) DEFAULT 0,
    Notes TEXT,
    CreatedBy INTEGER REFERENCES Users(UserID),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create PurchaseReturnItems Table
CREATE TABLE IF NOT EXISTS PurchaseReturnItems (
    ReturnItemID SERIAL PRIMARY KEY,
    ReturnID INTEGER REFERENCES PurchaseReturns(ReturnID) ON DELETE CASCADE,
    ProductID INTEGER REFERENCES Products(ProductID),
    Quantity DECIMAL(10, 4) NOT NULL, -- Base Unit Quantity (e.g. m2 or pcs)
    UnitID INTEGER REFERENCES Units(UnitID),
    UnitPrice DECIMAL(10, 2) NOT NULL,
    Total DECIMAL(10, 2) NOT NULL,
    Reason TEXT
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_purchase_returns_factory ON PurchaseReturns(FactoryID);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_brand ON PurchaseReturns(BrandID);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON PurchaseReturns(ReturnDate);

-- Drop existing tables if any
DROP TABLE IF EXISTS AuditLogs CASCADE;
DROP TABLE IF EXISTS RolePermissions CASCADE;
DROP TABLE IF EXISTS Permissions CASCADE;
DROP TABLE IF EXISTS Users CASCADE;
DROP TABLE IF EXISTS ImportJobs CASCADE;
DROP TABLE IF EXISTS VehicleMaintenances CASCADE;
DROP TABLE IF EXISTS Deliveries CASCADE;
DROP TABLE IF EXISTS Drivers CASCADE;
DROP TABLE IF EXISTS Vehicles CASCADE;
DROP TABLE IF EXISTS Payroll CASCADE;
DROP TABLE IF EXISTS PayrollPeriods CASCADE;
DROP TABLE IF EXISTS Attendance CASCADE;
DROP TABLE IF EXISTS Employees CASCADE;
DROP TABLE IF EXISTS AccountingEntries CASCADE;
DROP TABLE IF EXISTS PaymentAllocations CASCADE;
DROP TABLE IF EXISTS Payments CASCADE;
DROP TABLE IF EXISTS CustomerInteractions CASCADE;
DROP TABLE IF EXISTS CustomerContacts CASCADE;
DROP TABLE IF EXISTS SettlementItems CASCADE;
DROP TABLE IF EXISTS FactorySettlements CASCADE;
DROP TABLE IF EXISTS GoodsReceiptItems CASCADE;
DROP TABLE IF EXISTS GoodsReceipts CASCADE;
DROP TABLE IF EXISTS PurchaseOrderItems CASCADE;
DROP TABLE IF EXISTS PurchaseOrders CASCADE;
DROP TABLE IF EXISTS Invoices CASCADE;
DROP TABLE IF EXISTS OrderItems CASCADE;
DROP TABLE IF EXISTS Orders CASCADE;
DROP TABLE IF EXISTS Customers CASCADE;
DROP TABLE IF EXISTS CustomerProductPrices CASCADE;
DROP TABLE IF EXISTS BuyingPrices CASCADE;
DROP TABLE IF EXISTS PriceListItems CASCADE;
DROP TABLE IF EXISTS PriceLists CASCADE;
DROP TABLE IF EXISTS InventoryTransactions CASCADE;
DROP TABLE IF EXISTS Inventory CASCADE;
DROP TABLE IF EXISTS Factories CASCADE;
DROP TABLE IF EXISTS Warehouses CASCADE;
DROP TABLE IF EXISTS ProductUnits CASCADE;
DROP TABLE IF EXISTS Products CASCADE;
DROP TABLE IF EXISTS Units CASCADE;
DROP TABLE IF EXISTS Brands CASCADE;
DROP TABLE IF EXISTS Categories CASCADE;

-- Drop sequences
DROP SEQUENCE IF EXISTS orders_seq;

-- Create sequence for order numbers
CREATE SEQUENCE orders_seq START 1;

-- Categories
CREATE TABLE Categories (
    CategoryID SERIAL PRIMARY KEY,
    CategoryName VARCHAR(100) NOT NULL,
    ParentCategoryID INT,
    Description TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE Categories ADD CONSTRAINT fk_parent_category 
    FOREIGN KEY (ParentCategoryID) REFERENCES Categories(CategoryID);

-- Brands
CREATE TABLE Brands (
    BrandID SERIAL PRIMARY KEY,
    BrandName VARCHAR(100) NOT NULL UNIQUE,
    Description TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Units
CREATE TABLE Units (
    UnitID SERIAL PRIMARY KEY,
    UnitCode VARCHAR(20) NOT NULL UNIQUE,
    UnitName VARCHAR(50) NOT NULL,
    Description TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE Products (
    ProductID SERIAL PRIMARY KEY,
    ProductCode VARCHAR(50) NOT NULL UNIQUE,
    ProductName VARCHAR(200) NOT NULL,
    CategoryID INT REFERENCES Categories(CategoryID),
    BrandID INT REFERENCES Brands(BrandID),
    PrimaryUnitID INT REFERENCES Units(UnitID),
    Description TEXT,
    Specifications JSONB,
    BasePrice DECIMAL(15,2) DEFAULT 0.00,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_code ON Products(ProductCode);
CREATE INDEX idx_product_category ON Products(CategoryID);
CREATE INDEX idx_product_brand ON Products(BrandID);

-- ProductUnits
CREATE TABLE ProductUnits (
    ProductUnitID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID) ON DELETE CASCADE,
    UnitID INT REFERENCES Units(UnitID),
    ConversionFactor DECIMAL(10,4) NOT NULL,
    Barcode VARCHAR(100),
    IsDefault BOOLEAN DEFAULT FALSE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ProductID, UnitID)
);

-- Warehouses
CREATE TABLE Warehouses (
    WarehouseID SERIAL PRIMARY KEY,
    WarehouseCode VARCHAR(50) NOT NULL UNIQUE,
    WarehouseName VARCHAR(100) NOT NULL,
    Location VARCHAR(200),
    Address TEXT,
    ManagerID INT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Factories
CREATE TABLE Factories (
    FactoryID SERIAL PRIMARY KEY,
    FactoryCode VARCHAR(50) NOT NULL UNIQUE,
    FactoryName VARCHAR(100) NOT NULL,
    ContactPerson VARCHAR(100),
    Phone VARCHAR(20),
    Email VARCHAR(100),
    Address TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory
CREATE TABLE Inventory (
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
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ProductID, WarehouseID, OwnershipType, FactoryID)
);

CREATE INDEX idx_inventory_product ON Inventory(ProductID);
CREATE INDEX idx_inventory_warehouse ON Inventory(WarehouseID);

-- InventoryTransactions
CREATE TABLE InventoryTransactions (
    TransactionID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    TransactionType VARCHAR(20) NOT NULL CHECK (TransactionType IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
    Quantity DECIMAL(15,4) NOT NULL,
    ReferenceType VARCHAR(50),
    ReferenceID INT,
    OwnershipType VARCHAR(20) CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID),
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inv_trans_product ON InventoryTransactions(ProductID);
CREATE INDEX idx_inv_trans_date ON InventoryTransactions(CreatedAt);

-- PriceLists
CREATE TABLE PriceLists (
    PriceListID SERIAL PRIMARY KEY,
    PriceListCode VARCHAR(50) NOT NULL UNIQUE,
    PriceListName VARCHAR(100) NOT NULL,
    Description TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PriceListItems
CREATE TABLE PriceListItems (
    PriceListItemID SERIAL PRIMARY KEY,
    PriceListID INT REFERENCES PriceLists(PriceListID) ON DELETE CASCADE,
    ProductID INT REFERENCES Products(ProductID) ON DELETE CASCADE,
    Price DECIMAL(15,2) NOT NULL,
    EffectiveFrom DATE DEFAULT CURRENT_DATE,
    EffectiveTo DATE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(PriceListID, ProductID, EffectiveFrom)
);

CREATE INDEX idx_pricelist_product ON PriceListItems(ProductID);
CREATE INDEX idx_pricelist_effective ON PriceListItems(EffectiveFrom, EffectiveTo);

-- BuyingPrices
CREATE TABLE BuyingPrices (
    BuyingPriceID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID),
    FactoryID INT REFERENCES Factories(FactoryID),
    BuyingPrice DECIMAL(15,2) NOT NULL,
    EffectiveFrom DATE DEFAULT CURRENT_DATE,
    EffectiveTo DATE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_buying_product ON BuyingPrices(ProductID);
CREATE INDEX idx_buying_factory ON BuyingPrices(FactoryID);

-- Customers
CREATE TABLE Customers (
    CustomerID SERIAL PRIMARY KEY,
    CustomerCode VARCHAR(50) NOT NULL UNIQUE,
    CustomerName VARCHAR(200) NOT NULL,
    CustomerType VARCHAR(20) NOT NULL CHECK (CustomerType IN ('RETAIL', 'WHOLESALE', 'BOTH')),
    PriceListID INT REFERENCES PriceLists(PriceListID),
    ContactPerson VARCHAR(100),
    Phone VARCHAR(20),
    Email VARCHAR(100),
    Address TEXT,
    TaxID VARCHAR(50),
    CreditLimit DECIMAL(15,2) DEFAULT 0.00,
    CurrentBalance DECIMAL(15,2) DEFAULT 0.00,
    PaymentTerms VARCHAR(50),
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_code ON Customers(CustomerCode);
CREATE INDEX idx_customer_type ON Customers(CustomerType);

-- CRITICAL: CustomerProductPrices
CREATE TABLE CustomerProductPrices (
    CustomerProductPriceID SERIAL PRIMARY KEY,
    CustomerID INT REFERENCES Customers(CustomerID) ON DELETE CASCADE,
    ProductID INT REFERENCES Products(ProductID) ON DELETE CASCADE,
    SpecificPrice DECIMAL(15,2) NOT NULL,
    EffectiveFrom DATE DEFAULT CURRENT_DATE,
    EffectiveTo DATE,
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(CustomerID, ProductID)
);

CREATE INDEX idx_customer_product ON CustomerProductPrices(CustomerID, ProductID);
CREATE INDEX idx_customer_price_effective ON CustomerProductPrices(EffectiveFrom, EffectiveTo);

-- Orders
CREATE TABLE Orders (
    OrderID SERIAL PRIMARY KEY,
    OrderNumber VARCHAR(50) NOT NULL UNIQUE,
    OrderType VARCHAR(20) NOT NULL CHECK (OrderType IN ('RETAIL', 'WHOLESALE', 'CONSIGNMENT')),
    CustomerID INT REFERENCES Customers(CustomerID),
    OrderDate DATE DEFAULT CURRENT_DATE,
    RequiredDate DATE,
    Status VARCHAR(20) DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    SubTotal DECIMAL(15,2) DEFAULT 0.00,
    DiscountAmount DECIMAL(15,2) DEFAULT 0.00,
    TaxAmount DECIMAL(15,2) DEFAULT 0.00,
    TotalAmount DECIMAL(15,2) DEFAULT 0.00,
    Notes TEXT,
    SalesPersonID INT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_number ON Orders(OrderNumber);
CREATE INDEX idx_order_customer ON Orders(CustomerID);
CREATE INDEX idx_order_date ON Orders(OrderDate);
CREATE INDEX idx_order_status ON Orders(Status);

-- OrderItems
CREATE TABLE OrderItems (
    OrderItemID SERIAL PRIMARY KEY,
    OrderID INT REFERENCES Orders(OrderID) ON DELETE CASCADE,
    ProductID INT REFERENCES Products(ProductID),
    Quantity DECIMAL(15,4) NOT NULL,
    UnitID INT REFERENCES Units(UnitID),
    UnitPrice DECIMAL(15,2) NOT NULL,
    DiscountPercent DECIMAL(5,2) DEFAULT 0.00,
    DiscountAmount DECIMAL(15,2) DEFAULT 0.00,
    TaxPercent DECIMAL(5,2) DEFAULT 0.00,
    TaxAmount DECIMAL(15,2) DEFAULT 0.00,
    LineTotal DECIMAL(15,2) NOT NULL,
    PriceSource VARCHAR(50),
    OwnershipType VARCHAR(20) CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID),
    CommissionRate DECIMAL(5,2),
    Notes TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orderitem_order ON OrderItems(OrderID);
CREATE INDEX idx_orderitem_product ON OrderItems(ProductID);

-- Employees
CREATE TABLE Employees (
    EmployeeID SERIAL PRIMARY KEY,
    EmployeeCode VARCHAR(50) NOT NULL UNIQUE,
    FirstName VARCHAR(100) NOT NULL,
    LastName VARCHAR(100) NOT NULL,
    Position VARCHAR(100),
    Department VARCHAR(100),
    HireDate DATE,
    Phone VARCHAR(20),
    Email VARCHAR(100),
    Address TEXT,
    BasicSalary DECIMAL(15,2) DEFAULT 0.00,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employee_code ON Employees(EmployeeCode);

-- Users
CREATE TABLE Users (
    UserID SERIAL PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Email VARCHAR(100) UNIQUE,
    EmployeeID INT REFERENCES Employees(EmployeeID),
    Role VARCHAR(50) NOT NULL,
    IsActive BOOLEAN DEFAULT TRUE,
    LastLogin TIMESTAMP,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_username ON Users(Username);

-- Permissions
CREATE TABLE Permissions (
    PermissionID SERIAL PRIMARY KEY,
    PermissionCode VARCHAR(50) NOT NULL UNIQUE,
    PermissionName VARCHAR(100) NOT NULL,
    Module VARCHAR(50),
    Description TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE Invoices (
    InvoiceID SERIAL PRIMARY KEY,
    InvoiceNumber VARCHAR(50) NOT NULL UNIQUE,
    OrderID INT REFERENCES Orders(OrderID),
    CustomerID INT REFERENCES Customers(CustomerID),
    InvoiceDate DATE DEFAULT CURRENT_DATE,
    DueDate DATE,
    Status VARCHAR(20) DEFAULT 'UNPAID' CHECK (Status IN ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED')),
    SubTotal DECIMAL(15,2) NOT NULL,
    DiscountAmount DECIMAL(15,2) DEFAULT 0.00,
    TaxAmount DECIMAL(15,2) NOT NULL,
    TotalAmount DECIMAL(15,2) NOT NULL,
    PaidAmount DECIMAL(15,2) DEFAULT 0.00,
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_number ON Invoices(InvoiceNumber);
CREATE INDEX idx_invoice_customer ON Invoices(CustomerID);

-- Insert seed data
INSERT INTO Units (UnitCode, UnitName, Description) VALUES
('PCS', 'Piece', 'Individual piece'),
('BOX', 'Box', 'Box of items'),
('SQM', 'Square Meter', 'Area measurement');

INSERT INTO PriceLists (PriceListCode, PriceListName, Description) VALUES
('RETAIL', 'Retail Price List', 'Standard retail pricing'),
('WHOLESALE', 'Wholesale Price List', 'Wholesale/Gros pricing'),
('SPECIAL', 'Special Price List', 'Special negotiated pricing');

INSERT INTO Permissions (PermissionCode, PermissionName, Module) VALUES
('PRODUCT_VIEW', 'View Products', 'CATALOG'),
('PRODUCT_CREATE', 'Create Products', 'CATALOG'),
('ORDER_CREATE', 'Create Orders', 'SALES'),
('PRICE_EDIT', 'Edit Prices', 'PRICING');

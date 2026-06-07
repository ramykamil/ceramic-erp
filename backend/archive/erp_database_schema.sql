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
DROP SEQUENCE IF EXISTS po_seq;
DROP SEQUENCE IF EXISTS gr_seq; -- <-- AJOUTEZ CETTE LIGNE
-- Create sequence for order numbers
CREATE SEQUENCE orders_seq START 1;
CREATE SEQUENCE po_seq START 1;
CREATE SEQUENCE gr_seq START 1; -- <-- AJOUTEZ CETTE LIGNE

-- ========================================
-- CERAMIC & TILES DISTRIBUTOR ERP SYSTEM
-- COMPLETE DATABASE SCHEMA
-- PostgreSQL 14+
-- ========================================

-- ========================================
-- MODULE 1: CATALOG & PRODUCT MASTER
-- ========================================

CREATE TABLE Categories (
    CategoryID SERIAL PRIMARY KEY,
    CategoryName VARCHAR(100) NOT NULL,
    ParentCategoryID INT REFERENCES Categories(CategoryID),
    Description TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Brands (
    BrandID SERIAL PRIMARY KEY,
    BrandName VARCHAR(100) NOT NULL UNIQUE,
    Description TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Units (
    UnitID SERIAL PRIMARY KEY,
    UnitCode VARCHAR(20) NOT NULL UNIQUE, -- 'PCS', 'BOX', 'SQM'
    UnitName VARCHAR(50) NOT NULL,
    Description TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Products (
    ProductID SERIAL PRIMARY KEY,
    ProductCode VARCHAR(50) NOT NULL UNIQUE,
    ProductName VARCHAR(200) NOT NULL,
    CategoryID INT REFERENCES Categories(CategoryID),
    BrandID INT REFERENCES Brands(BrandID),
    PrimaryUnitID INT REFERENCES Units(UnitID),
    Description TEXT,
    Specifications JSONB, -- Store technical specs like size, finish, etc.
    BasePrice DECIMAL(15,2) DEFAULT 0.00,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ProductUnits (
    ProductUnitID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID) ON DELETE CASCADE,
    UnitID INT REFERENCES Units(UnitID),
    ConversionFactor DECIMAL(10,4) NOT NULL, -- e.g., 1 box = 10 pieces
    Barcode VARCHAR(100),
    IsDefault BOOLEAN DEFAULT FALSE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ProductID, UnitID)
);

-- ========================================
-- MODULE 2: INVENTORY & WAREHOUSING
-- ========================================

CREATE TABLE Warehouses (
    WarehouseID SERIAL PRIMARY KEY,
    WarehouseCode VARCHAR(50) NOT NULL UNIQUE,
    WarehouseName VARCHAR(100) NOT NULL,
    Location VARCHAR(200),
    Address TEXT,
    ManagerID INT, -- References Users table
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE Inventory (
    InventoryID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    OwnershipType VARCHAR(20) NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID), -- NULL if OWNED, required if CONSIGNMENT
    QuantityOnHand DECIMAL(15,4) DEFAULT 0.00,
    QuantityReserved DECIMAL(15,4) DEFAULT 0.00,
    QuantityAvailable DECIMAL(15,4) GENERATED ALWAYS AS (QuantityOnHand - QuantityReserved) STORED,
    ReorderLevel DECIMAL(15,4) DEFAULT 0.00,
    MaxStockLevel DECIMAL(15,4),
    LastRestockedAt TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ProductID, WarehouseID, OwnershipType, FactoryID)
);

CREATE TABLE InventoryTransactions (
    TransactionID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    TransactionType VARCHAR(20) NOT NULL CHECK (TransactionType IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
    Quantity DECIMAL(15,4) NOT NULL,
    ReferenceType VARCHAR(50), -- 'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT'
    ReferenceID INT, -- ID of the related document
    OwnershipType VARCHAR(20) CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID),
    Notes TEXT,
    CreatedBy INT, -- References Users table
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 3: PRICING & PRICE LISTS
-- ========================================

CREATE TABLE PriceLists (
    PriceListID SERIAL PRIMARY KEY,
    PriceListCode VARCHAR(50) NOT NULL UNIQUE,
    PriceListName VARCHAR(100) NOT NULL, -- 'Retail', 'Wholesale', 'Gros'
    Description TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- CRITICAL: Customer-Specific Pricing Table
CREATE TABLE CustomerProductPrices (
    CustomerProductPriceID SERIAL PRIMARY KEY,
    CustomerID INT NOT NULL, -- References Customers table
    ProductID INT REFERENCES Products(ProductID) ON DELETE CASCADE,
    SpecificPrice DECIMAL(15,2) NOT NULL,
    EffectiveFrom DATE DEFAULT CURRENT_DATE,
    EffectiveTo DATE,
    Notes TEXT,
    CreatedBy INT, -- References Users table
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(CustomerID, ProductID)
);

-- ========================================
-- MODULE 4 & 5: SALES, POS, WHOLESALE
-- ========================================

CREATE TABLE Customers (
    CustomerID SERIAL PRIMARY KEY,
    CustomerCode VARCHAR(50) NOT NULL UNIQUE,
    CustomerName VARCHAR(200) NOT NULL,
    CustomerType VARCHAR(20) NOT NULL CHECK (CustomerType IN ('RETAIL', 'WHOLESALE', 'BOTH')),
    PriceListID INT REFERENCES PriceLists(PriceListID), -- Default price list
    ContactPerson VARCHAR(100),
    Phone VARCHAR(20),
    Email VARCHAR(100),
    Address TEXT,
    TaxID VARCHAR(50),
    CreditLimit DECIMAL(15,2) DEFAULT 0.00,
    CurrentBalance DECIMAL(15,2) DEFAULT 0.00,
    PaymentTerms VARCHAR(50), -- 'NET30', 'NET60', 'COD'
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    SalesPersonID INT, -- References Users table
    CreatedBy INT, -- References Users table
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    PriceSource VARCHAR(50), -- 'CONTRACT', 'PRICELIST', 'BASE' - for audit trail
    OwnershipType VARCHAR(20) CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID), -- If consignment
    CommissionRate DECIMAL(5,2), -- If consignment
    Notes TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    BalanceAmount DECIMAL(15,2) GENERATED ALWAYS AS (TotalAmount - PaidAmount) STORED,
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 6: PURCHASING & RECEIPTS
-- ========================================

CREATE TABLE PurchaseOrders (
    PurchaseOrderID SERIAL PRIMARY KEY,
    PONumber VARCHAR(50) NOT NULL UNIQUE,
    FactoryID INT REFERENCES Factories(FactoryID),
    OrderDate DATE DEFAULT CURRENT_DATE,
    ExpectedDeliveryDate DATE,
    Status VARCHAR(20) DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'APPROVED', 'RECEIVED', 'PARTIAL', 'CANCELLED')),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    OwnershipType VARCHAR(20) NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    SubTotal DECIMAL(15,2) DEFAULT 0.00,
    TaxAmount DECIMAL(15,2) DEFAULT 0.00,
    TotalAmount DECIMAL(15,2) DEFAULT 0.00,
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PurchaseOrderItems (
    POItemID SERIAL PRIMARY KEY,
    PurchaseOrderID INT REFERENCES PurchaseOrders(PurchaseOrderID) ON DELETE CASCADE,
    ProductID INT REFERENCES Products(ProductID),
    Quantity DECIMAL(15,4) NOT NULL,
    UnitID INT REFERENCES Units(UnitID),
    UnitPrice DECIMAL(15,2) NOT NULL,
    TaxPercent DECIMAL(5,2) DEFAULT 0.00,
    TaxAmount DECIMAL(15,2) DEFAULT 0.00,
    LineTotal DECIMAL(15,2) NOT NULL,
    ReceivedQuantity DECIMAL(15,4) DEFAULT 0.00,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE GoodsReceipts (
    ReceiptID SERIAL PRIMARY KEY,
    ReceiptNumber VARCHAR(50) NOT NULL UNIQUE,
    PurchaseOrderID INT REFERENCES PurchaseOrders(PurchaseOrderID),
    FactoryID INT REFERENCES Factories(FactoryID),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    ReceiptDate DATE DEFAULT CURRENT_DATE,
    OwnershipType VARCHAR(20) NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    Status VARCHAR(20) DEFAULT 'RECEIVED' CHECK (Status IN ('RECEIVED', 'INSPECTED', 'ACCEPTED', 'REJECTED')),
    Notes TEXT,
    ReceivedBy INT, -- References Users table
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE GoodsReceiptItems (
    ReceiptItemID SERIAL PRIMARY KEY,
    ReceiptID INT REFERENCES GoodsReceipts(ReceiptID) ON DELETE CASCADE,
    POItemID INT REFERENCES PurchaseOrderItems(POItemID),
    ProductID INT REFERENCES Products(ProductID),
    QuantityReceived DECIMAL(15,4) NOT NULL,
    QuantityAccepted DECIMAL(15,4),
    QuantityRejected DECIMAL(15,4),
    UnitID INT REFERENCES Units(UnitID),
    Notes TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 7: FACTORY SETTLEMENTS & COMMISSIONING
-- ========================================

CREATE TABLE FactorySettlements (
    SettlementID SERIAL PRIMARY KEY,
    SettlementNumber VARCHAR(50) NOT NULL UNIQUE,
    FactoryID INT REFERENCES Factories(FactoryID),
    SettlementDate DATE DEFAULT CURRENT_DATE,
    PeriodFrom DATE NOT NULL,
    PeriodTo DATE NOT NULL,
    TotalSalesAmount DECIMAL(15,2) DEFAULT 0.00,
    TotalCommissionAmount DECIMAL(15,2) DEFAULT 0.00,
    TotalPurchaseAmount DECIMAL(15,2) DEFAULT 0.00,
    NetAmount DECIMAL(15,2) DEFAULT 0.00,
    Status VARCHAR(20) DEFAULT 'DRAFT' CHECK (Status IN ('DRAFT', 'FINALIZED', 'PAID')),
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE SettlementItems (
    SettlementItemID SERIAL PRIMARY KEY,
    SettlementID INT REFERENCES FactorySettlements(SettlementID) ON DELETE CASCADE,
    ReferenceType VARCHAR(50), -- 'SALE', 'PURCHASE', 'COMMISSION'
    ReferenceID INT, -- OrderID, PurchaseOrderID, etc.
    ProductID INT REFERENCES Products(ProductID),
    Quantity DECIMAL(15,4),
    Amount DECIMAL(15,2),
    CommissionRate DECIMAL(5,2),
    CommissionAmount DECIMAL(15,2),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 8: CUSTOMERS & CRM
-- ========================================

CREATE TABLE CustomerContacts (
    ContactID SERIAL PRIMARY KEY,
    CustomerID INT REFERENCES Customers(CustomerID) ON DELETE CASCADE,
    ContactName VARCHAR(100) NOT NULL,
    Position VARCHAR(100),
    Phone VARCHAR(20),
    Email VARCHAR(100),
    IsPrimary BOOLEAN DEFAULT FALSE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE CustomerInteractions (
    InteractionID SERIAL PRIMARY KEY,
    CustomerID INT REFERENCES Customers(CustomerID),
    InteractionType VARCHAR(50), -- 'CALL', 'EMAIL', 'MEETING', 'VISIT'
    Subject VARCHAR(200),
    Notes TEXT,
    InteractionDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UserID INT, -- References Users table
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 9: ACCOUNTING & PAYMENTS
-- ========================================

CREATE TABLE Payments (
    PaymentID SERIAL PRIMARY KEY,
    PaymentNumber VARCHAR(50) NOT NULL UNIQUE,
    PaymentType VARCHAR(20) NOT NULL CHECK (PaymentType IN ('RECEIPT', 'PAYMENT')),
    CustomerID INT REFERENCES Customers(CustomerID),
    FactoryID INT REFERENCES Factories(FactoryID),
    PaymentDate DATE DEFAULT CURRENT_DATE,
    PaymentMethod VARCHAR(50), -- 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD'
    Amount DECIMAL(15,2) NOT NULL,
    ReferenceNumber VARCHAR(100),
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PaymentAllocations (
    AllocationID SERIAL PRIMARY KEY,
    PaymentID INT REFERENCES Payments(PaymentID) ON DELETE CASCADE,
    InvoiceID INT REFERENCES Invoices(InvoiceID),
    AllocatedAmount DECIMAL(15,2) NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE AccountingEntries (
    EntryID SERIAL PRIMARY KEY,
    EntryDate DATE DEFAULT CURRENT_DATE,
    ReferenceType VARCHAR(50), -- 'INVOICE', 'PAYMENT', 'PURCHASE', etc.
    ReferenceID INT,
    AccountCode VARCHAR(50) NOT NULL,
    DebitAmount DECIMAL(15,2) DEFAULT 0.00,
    CreditAmount DECIMAL(15,2) DEFAULT 0.00,
    Description TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 10: PAYROLL & HR
-- ========================================

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

CREATE TABLE Attendance (
    AttendanceID SERIAL PRIMARY KEY,
    EmployeeID INT REFERENCES Employees(EmployeeID),
    AttendanceDate DATE NOT NULL,
    CheckInTime TIME,
    CheckOutTime TIME,
    HoursWorked DECIMAL(5,2),
    Status VARCHAR(20) CHECK (Status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE')),
    Notes TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(EmployeeID, AttendanceDate)
);

CREATE TABLE PayrollPeriods (
    PeriodID SERIAL PRIMARY KEY,
    PeriodName VARCHAR(100) NOT NULL,
    PeriodFrom DATE NOT NULL,
    PeriodTo DATE NOT NULL,
    Status VARCHAR(20) DEFAULT 'OPEN' CHECK (Status IN ('OPEN', 'PROCESSING', 'FINALIZED', 'PAID')),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Payroll (
    PayrollID SERIAL PRIMARY KEY,
    PeriodID INT REFERENCES PayrollPeriods(PeriodID),
    EmployeeID INT REFERENCES Employees(EmployeeID),
    BasicSalary DECIMAL(15,2) NOT NULL,
    Allowances DECIMAL(15,2) DEFAULT 0.00,
    Deductions DECIMAL(15,2) DEFAULT 0.00,
    NetSalary DECIMAL(15,2) NOT NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'APPROVED', 'PAID')),
    PaymentDate DATE,
    Notes TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(PeriodID, EmployeeID)
);

-- ========================================
-- MODULE 11: FLEET & LOGISTICS
-- ========================================

CREATE TABLE Vehicles (
    VehicleID SERIAL PRIMARY KEY,
    VehicleNumber VARCHAR(50) NOT NULL UNIQUE,
    VehicleType VARCHAR(50), -- 'TRUCK', 'VAN', 'PICKUP'
    Make VARCHAR(100),
    Model VARCHAR(100),
    Year INT,
    Capacity DECIMAL(10,2), -- in tons or cubic meters
    RegistrationNumber VARCHAR(50),
    InsuranceExpiryDate DATE,
    LastMaintenanceDate DATE,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Drivers (
    DriverID SERIAL PRIMARY KEY,
    EmployeeID INT REFERENCES Employees(EmployeeID),
    LicenseNumber VARCHAR(50) NOT NULL UNIQUE,
    LicenseExpiryDate DATE,
    Phone VARCHAR(20),
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Deliveries (
    DeliveryID SERIAL PRIMARY KEY,
    DeliveryNumber VARCHAR(50) NOT NULL UNIQUE,
    OrderID INT REFERENCES Orders(OrderID),
    VehicleID INT REFERENCES Vehicles(VehicleID),
    DriverID INT REFERENCES Drivers(DriverID),
    DeliveryDate DATE DEFAULT CURRENT_DATE,
    DepartureTime TIMESTAMP,
    ArrivalTime TIMESTAMP,
    Status VARCHAR(20) DEFAULT 'SCHEDULED' CHECK (Status IN ('SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')),
    DeliveryAddress TEXT,
    RecipientName VARCHAR(100),
    RecipientSignature TEXT, -- Could store base64 image or file path
    ProofOfDelivery TEXT, -- File path or URL to POD document/image
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE VehicleMaintenances (
    MaintenanceID SERIAL PRIMARY KEY,
    VehicleID INT REFERENCES Vehicles(VehicleID),
    MaintenanceDate DATE NOT NULL,
    MaintenanceType VARCHAR(50), -- 'ROUTINE', 'REPAIR', 'INSPECTION'
    Description TEXT,
    Cost DECIMAL(15,2),
    NextMaintenanceDate DATE, 
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 12: REPORTING & DASHBOARDS
-- (No specific tables - uses views and aggregations)
-- ========================================

-- ========================================
-- MODULE 13: ADMIN, SECURITY & AUDIT
-- ========================================

CREATE TABLE Users (
    UserID SERIAL PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Email VARCHAR(100) UNIQUE,
    EmployeeID INT REFERENCES Employees(EmployeeID),
    Role VARCHAR(50) NOT NULL, -- 'ADMIN', 'MANAGER', 'SALES', 'WAREHOUSE', 'DRIVER'
    IsActive BOOLEAN DEFAULT TRUE,
    LastLogin TIMESTAMP,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Permissions (
    PermissionID SERIAL PRIMARY KEY,
    PermissionCode VARCHAR(50) NOT NULL UNIQUE,
    PermissionName VARCHAR(100) NOT NULL,
    Module VARCHAR(50),
    Description TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE RolePermissions (
    RolePermissionID SERIAL PRIMARY KEY,
    Role VARCHAR(50) NOT NULL,
    PermissionID INT REFERENCES Permissions(PermissionID),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(Role, PermissionID)
);

CREATE TABLE AuditLogs (
    AuditID SERIAL PRIMARY KEY,
    UserID INT REFERENCES Users(UserID),
    Action VARCHAR(100) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'
    TableName VARCHAR(100),
    RecordID INT,
    OldValues JSONB,
    NewValues JSONB,
    IPAddress VARCHAR(50),
    UserAgent TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- MODULE 14: DATA IMPORT/EXPORT
-- ========================================

CREATE TABLE ImportJobs (
    ImportJobID SERIAL PRIMARY KEY,
    JobName VARCHAR(100) NOT NULL,
    EntityType VARCHAR(50) NOT NULL, -- 'PRODUCTS', 'CUSTOMERS', 'PRICES', etc.
    FileName VARCHAR(255),
    FilePath TEXT,
    Status VARCHAR(20) DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    TotalRecords INT DEFAULT 0,
    SuccessfulRecords INT DEFAULT 0,
    FailedRecords INT DEFAULT 0,
    ErrorLog TEXT,
    CreatedBy INT REFERENCES Users(UserID),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CompletedAt TIMESTAMP
);

-- ========================================
-- MODULE 15: MOBILE APPS
-- (Uses same tables, accessed via mobile-optimized API endpoints)
-- ========================================

-- ========================================
-- FOREIGN KEY CONSTRAINTS (Deferred)
-- ========================================

ALTER TABLE Warehouses ADD CONSTRAINT fk_warehouse_manager 
    FOREIGN KEY (ManagerID) REFERENCES Users(UserID);

ALTER TABLE Orders ADD CONSTRAINT fk_order_salesperson 
    FOREIGN KEY (SalesPersonID) REFERENCES Users(UserID);

ALTER TABLE Orders ADD CONSTRAINT fk_order_creator 
    FOREIGN KEY (CreatedBy) REFERENCES Users(UserID);

ALTER TABLE InventoryTransactions ADD CONSTRAINT fk_inv_trans_creator 
    FOREIGN KEY (CreatedBy) REFERENCES Users(UserID);

ALTER TABLE CustomerProductPrices ADD CONSTRAINT fk_customer_product_price_customer 
    FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID) ON DELETE CASCADE;

ALTER TABLE CustomerProductPrices ADD CONSTRAINT fk_customer_product_price_creator 
    FOREIGN KEY (CreatedBy) REFERENCES Users(UserID);

-- ========================================
-- USEFUL VIEWS
-- ========================================

-- View: Current Inventory Levels
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

-- View: Customer Outstanding Balances
CREATE VIEW vw_CustomerBalances AS
SELECT 
    c.CustomerID,
    c.CustomerCode,
    c.CustomerName,
    c.CustomerType,
    c.CreditLimit,
    COALESCE(SUM(inv.BalanceAmount), 0) AS OutstandingBalance,
    c.CreditLimit - COALESCE(SUM(inv.BalanceAmount), 0) AS AvailableCredit
FROM Customers c
LEFT JOIN Invoices inv ON c.CustomerID = inv.CustomerID AND inv.Status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
GROUP BY c.CustomerID, c.CustomerCode, c.CustomerName, c.CustomerType, c.CreditLimit;

-- View: Product Pricing Summary
CREATE VIEW vw_ProductPricing AS
SELECT 
    p.ProductID,
    p.ProductCode,
    p.ProductName,
    p.BasePrice,
    pl.PriceListName,
    pli.Price AS PriceListPrice
FROM Products p
CROSS JOIN PriceLists pl
LEFT JOIN PriceListItems pli ON p.ProductID = pli.ProductID AND pl.PriceListID = pli.PriceListID
    AND CURRENT_DATE BETWEEN pli.EffectiveFrom AND COALESCE(pli.EffectiveTo, '9999-12-31')
WHERE p.IsActive = TRUE AND pl.IsActive = TRUE;

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX idx_product_code ON Products(ProductCode);
CREATE INDEX idx_product_category ON Products(CategoryID);
CREATE INDEX idx_product_brand ON Products(BrandID);
CREATE INDEX idx_inventory_product ON Inventory(ProductID);
CREATE INDEX idx_inventory_warehouse ON Inventory(WarehouseID);
CREATE INDEX idx_inv_trans_product ON InventoryTransactions(ProductID);
CREATE INDEX idx_inv_trans_date ON InventoryTransactions(CreatedAt);
CREATE INDEX idx_pricelist_product ON PriceListItems(ProductID);
CREATE INDEX idx_pricelist_effective ON PriceListItems(EffectiveFrom, EffectiveTo);
CREATE INDEX idx_buying_product ON BuyingPrices(ProductID);
CREATE INDEX idx_buying_factory ON BuyingPrices(FactoryID);
CREATE INDEX idx_customer_product ON CustomerProductPrices(CustomerID, ProductID);
CREATE INDEX idx_customer_price_effective ON CustomerProductPrices(EffectiveFrom, EffectiveTo);
CREATE INDEX idx_customer_code ON Customers(CustomerCode);
CREATE INDEX idx_customer_type ON Customers(CustomerType);
CREATE INDEX idx_order_number ON Orders(OrderNumber);
CREATE INDEX idx_order_customer ON Orders(CustomerID);
CREATE INDEX idx_order_date ON Orders(OrderDate);
CREATE INDEX idx_order_status ON Orders(Status);
CREATE INDEX idx_orders_created_at ON Orders(CreatedAt);
CREATE INDEX idx_orderitem_order ON OrderItems(OrderID);
CREATE INDEX idx_orderitem_product ON OrderItems(ProductID);
CREATE INDEX idx_invoice_number ON Invoices(InvoiceNumber);
CREATE INDEX idx_invoice_customer ON Invoices(CustomerID);
CREATE INDEX idx_invoice_status ON Invoices(Status);
CREATE INDEX idx_invoices_created_at ON Invoices(CreatedAt);
CREATE INDEX idx_po_number ON PurchaseOrders(PONumber);
CREATE INDEX idx_po_factory ON PurchaseOrders(FactoryID);
CREATE INDEX idx_po_date ON PurchaseOrders(OrderDate);
CREATE INDEX idx_poitem_po ON PurchaseOrderItems(PurchaseOrderID);
CREATE INDEX idx_poitem_product ON PurchaseOrderItems(ProductID);
CREATE INDEX idx_receipt_number ON GoodsReceipts(ReceiptNumber);
CREATE INDEX idx_receipt_po ON GoodsReceipts(PurchaseOrderID);
CREATE INDEX idx_settlement_factory ON FactorySettlements(FactoryID);
CREATE INDEX idx_settlement_date ON FactorySettlements(SettlementDate);
CREATE INDEX idx_interaction_customer ON CustomerInteractions(CustomerID);
CREATE INDEX idx_interaction_date ON CustomerInteractions(InteractionDate);
CREATE INDEX idx_payment_number ON Payments(PaymentNumber);
CREATE INDEX idx_payment_customer ON Payments(CustomerID);
CREATE INDEX idx_payment_date ON Payments(PaymentDate);
CREATE INDEX idx_payments_created_at ON Payments(CreatedAt);
CREATE INDEX idx_allocation_payment ON PaymentAllocations(PaymentID);
CREATE INDEX idx_allocation_invoice ON PaymentAllocations(InvoiceID);
CREATE INDEX idx_entry_date ON AccountingEntries(EntryDate);
CREATE INDEX idx_entry_account ON AccountingEntries(AccountCode);
CREATE INDEX idx_employee_code ON Employees(EmployeeCode);
CREATE INDEX idx_attendance_employee ON Attendance(EmployeeID);
CREATE INDEX idx_attendance_date ON Attendance(AttendanceDate);
CREATE INDEX idx_payroll_period ON Payroll(PeriodID);
CREATE INDEX idx_payroll_employee ON Payroll(EmployeeID);
CREATE INDEX idx_vehicle_number ON Vehicles(VehicleNumber);
CREATE INDEX idx_delivery_number ON Deliveries(DeliveryNumber);
CREATE INDEX idx_delivery_order ON Deliveries(OrderID);
CREATE INDEX idx_delivery_date ON Deliveries(DeliveryDate);
CREATE INDEX idx_deliveries_status ON Deliveries(Status);
CREATE INDEX idx_maintenance_vehicle ON VehicleMaintenances(VehicleID);
CREATE INDEX idx_username ON Users(Username);
CREATE INDEX idx_audit_user ON AuditLogs(UserID);
CREATE INDEX idx_audit_date ON AuditLogs(CreatedAt);
CREATE INDEX idx_audit_table ON AuditLogs(TableName);
CREATE INDEX idx_import_status ON ImportJobs(Status);
CREATE INDEX idx_import_date ON ImportJobs(CreatedAt);
CREATE INDEX idx_customer_product_prices_lookup ON CustomerProductPrices(CustomerID, ProductID, EffectiveFrom, EffectiveTo);

-- ========================================
-- TRIGGERS FOR AUDIT TRAIL
-- ========================================

-- Function to update UpdatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.UpdatedAt = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON Products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON Customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON Orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON Invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- INITIAL DATA SEEDS
-- ========================================

-- Insert default units
INSERT INTO Units (UnitCode, UnitName, Description) VALUES
('PCS', 'Piece', 'Individual piece'),
('BOX', 'Box', 'Box of items'),
('SQM', 'Square Meter', 'Area measurement');

-- Insert default price lists
INSERT INTO PriceLists (PriceListCode, PriceListName, Description) VALUES
('RETAIL', 'Retail Price List', 'Standard retail pricing'),
('WHOLESALE', 'Wholesale Price List', 'Wholesale/Gros pricing'),
('SPECIAL', 'Special Price List', 'Special negotiated pricing');

-- Insert default permissions
INSERT INTO Permissions (PermissionCode, PermissionName, Module) VALUES
('PRODUCT_VIEW', 'View Products', 'CATALOG'),
('PRODUCT_CREATE', 'Create Products', 'CATALOG'),
('PRODUCT_EDIT', 'Edit Products', 'CATALOG'),
('PRODUCT_DELETE', 'Delete Products', 'CATALOG'),
('INVENTORY_VIEW', 'View Inventory', 'INVENTORY'),
('INVENTORY_ADJUST', 'Adjust Inventory', 'INVENTORY'),
('ORDER_VIEW', 'View Orders', 'SALES'),
('ORDER_CREATE', 'Create Orders', 'SALES'),
('ORDER_EDIT', 'Edit Orders', 'SALES'),
('ORDER_DELETE', 'Delete Orders', 'SALES'),
('CUSTOMER_VIEW', 'View Customers', 'CRM'),
('CUSTOMER_CREATE', 'Create Customers', 'CRM'),
('CUSTOMER_EDIT', 'Edit Customers', 'CRM'),
('PRICE_VIEW', 'View Prices', 'PRICING'),
('PRICE_EDIT', 'Edit Prices', 'PRICING'),
('PAYMENT_VIEW', 'View Payments', 'ACCOUNTING'),
('PAYMENT_CREATE', 'Create Payments', 'ACCOUNTING'),
('REPORT_VIEW', 'View Reports', 'REPORTING'),
('ADMIN_FULL', 'Full Admin Access', 'ADMIN');

-- ========================================
-- END OF SCHEMA
-- ========================================

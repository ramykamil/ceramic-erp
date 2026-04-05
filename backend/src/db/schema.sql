-- ========================================
-- RETAIL ERP - SQLite Schema
-- Compatible with SQLite 3.x
-- ========================================

-- ========================================
-- TABLES
-- ========================================

-- Categories
CREATE TABLE IF NOT EXISTS Categories (
    CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
    CategoryName TEXT NOT NULL,
    ParentCategoryID INTEGER REFERENCES Categories(CategoryID),
    Description TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Brands
CREATE TABLE IF NOT EXISTS Brands (
    BrandID INTEGER PRIMARY KEY AUTOINCREMENT,
    BrandName TEXT NOT NULL UNIQUE,
    Description TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Units
CREATE TABLE IF NOT EXISTS Units (
    UnitID INTEGER PRIMARY KEY AUTOINCREMENT,
    UnitCode TEXT NOT NULL UNIQUE,
    UnitName TEXT NOT NULL,
    Description TEXT,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- Products
CREATE TABLE IF NOT EXISTS Products (
    ProductID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductCode TEXT NOT NULL UNIQUE,
    ProductName TEXT NOT NULL,
    CategoryID INTEGER REFERENCES Categories(CategoryID),
    BrandID INTEGER REFERENCES Brands(BrandID),
    PrimaryUnitID INTEGER REFERENCES Units(UnitID),
    Description TEXT,
    Specifications TEXT, -- JSON stored as TEXT
    BasePrice REAL DEFAULT 0.00,
    PurchasePrice REAL DEFAULT 0.00,
    Size TEXT,
    Calibre TEXT,
    Choix TEXT,
    QteParColis INTEGER DEFAULT 0,
    QteColisParPalette INTEGER DEFAULT 0,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- ProductUnits
CREATE TABLE IF NOT EXISTS ProductUnits (
    ProductUnitID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductID INTEGER REFERENCES Products(ProductID) ON DELETE CASCADE,
    UnitID INTEGER REFERENCES Units(UnitID),
    ConversionFactor REAL NOT NULL,
    Barcode TEXT,
    IsDefault INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(ProductID, UnitID)
);

-- Warehouses
CREATE TABLE IF NOT EXISTS Warehouses (
    WarehouseID INTEGER PRIMARY KEY AUTOINCREMENT,
    WarehouseCode TEXT NOT NULL UNIQUE,
    WarehouseName TEXT NOT NULL,
    Location TEXT,
    Address TEXT,
    ManagerID INTEGER,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Factories (Suppliers)
CREATE TABLE IF NOT EXISTS Factories (
    FactoryID INTEGER PRIMARY KEY AUTOINCREMENT,
    FactoryCode TEXT NOT NULL UNIQUE,
    FactoryName TEXT NOT NULL,
    ContactPerson TEXT,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Inventory
CREATE TABLE IF NOT EXISTS Inventory (
    InventoryID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductID INTEGER REFERENCES Products(ProductID),
    WarehouseID INTEGER REFERENCES Warehouses(WarehouseID),
    OwnershipType TEXT NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    QuantityOnHand REAL DEFAULT 0.00,
    QuantityReserved REAL DEFAULT 0.00,
    ReorderLevel REAL DEFAULT 0.00,
    MaxStockLevel REAL,
    PalletCount INTEGER DEFAULT 0,
    ColisCount INTEGER DEFAULT 0,
    LastRestockedAt TEXT,
    UpdatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(ProductID, WarehouseID, OwnershipType, FactoryID)
);

-- InventoryTransactions
CREATE TABLE IF NOT EXISTS InventoryTransactions (
    TransactionID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductID INTEGER REFERENCES Products(ProductID),
    WarehouseID INTEGER REFERENCES Warehouses(WarehouseID),
    TransactionType TEXT NOT NULL CHECK (TransactionType IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
    Quantity REAL NOT NULL,
    ReferenceType TEXT,
    ReferenceID INTEGER,
    OwnershipType TEXT CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    Notes TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- PriceLists
CREATE TABLE IF NOT EXISTS PriceLists (
    PriceListID INTEGER PRIMARY KEY AUTOINCREMENT,
    PriceListCode TEXT NOT NULL UNIQUE,
    PriceListName TEXT NOT NULL,
    Description TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- PriceListItems
CREATE TABLE IF NOT EXISTS PriceListItems (
    PriceListItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    PriceListID INTEGER REFERENCES PriceLists(PriceListID) ON DELETE CASCADE,
    ProductID INTEGER REFERENCES Products(ProductID) ON DELETE CASCADE,
    Price REAL NOT NULL,
    EffectiveFrom TEXT DEFAULT (date('now')),
    EffectiveTo TEXT,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(PriceListID, ProductID, EffectiveFrom)
);

-- BuyingPrices
CREATE TABLE IF NOT EXISTS BuyingPrices (
    BuyingPriceID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductID INTEGER REFERENCES Products(ProductID),
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    BuyingPrice REAL NOT NULL,
    EffectiveFrom TEXT DEFAULT (date('now')),
    EffectiveTo TEXT,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Customers
CREATE TABLE IF NOT EXISTS Customers (
    CustomerID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerCode TEXT NOT NULL UNIQUE,
    CustomerName TEXT NOT NULL,
    CustomerType TEXT NOT NULL CHECK (CustomerType IN ('RETAIL', 'WHOLESALE', 'BOTH')),
    PriceListID INTEGER REFERENCES PriceLists(PriceListID),
    ContactPerson TEXT,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    TaxID TEXT,
    CreditLimit REAL DEFAULT 0.00,
    CurrentBalance REAL DEFAULT 0.00,
    PaymentTerms TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- CustomerProductPrices
CREATE TABLE IF NOT EXISTS CustomerProductPrices (
    CustomerProductPriceID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER NOT NULL REFERENCES Customers(CustomerID) ON DELETE CASCADE,
    ProductID INTEGER REFERENCES Products(ProductID) ON DELETE CASCADE,
    SpecificPrice REAL NOT NULL,
    EffectiveFrom TEXT DEFAULT (date('now')),
    EffectiveTo TEXT,
    Notes TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(CustomerID, ProductID)
);

-- Orders
CREATE TABLE IF NOT EXISTS Orders (
    OrderID INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderNumber TEXT NOT NULL UNIQUE,
    OrderType TEXT NOT NULL CHECK (OrderType IN ('RETAIL', 'WHOLESALE', 'CONSIGNMENT')),
    CustomerID INTEGER REFERENCES Customers(CustomerID),
    OrderDate TEXT DEFAULT (date('now')),
    RequiredDate TEXT,
    Status TEXT DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    WarehouseID INTEGER REFERENCES Warehouses(WarehouseID),
    SubTotal REAL DEFAULT 0.00,
    DiscountAmount REAL DEFAULT 0.00,
    TaxAmount REAL DEFAULT 0.00,
    TotalAmount REAL DEFAULT 0.00,
    Notes TEXT,
    SalesPersonID INTEGER,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- OrderItems
CREATE TABLE IF NOT EXISTS OrderItems (
    OrderItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderID INTEGER REFERENCES Orders(OrderID) ON DELETE CASCADE,
    ProductID INTEGER REFERENCES Products(ProductID),
    Quantity REAL NOT NULL,
    UnitID INTEGER REFERENCES Units(UnitID),
    UnitPrice REAL NOT NULL,
    DiscountPercent REAL DEFAULT 0.00,
    DiscountAmount REAL DEFAULT 0.00,
    TaxPercent REAL DEFAULT 0.00,
    TaxAmount REAL DEFAULT 0.00,
    LineTotal REAL NOT NULL,
    PriceSource TEXT,
    OwnershipType TEXT CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    CommissionRate REAL,
    Notes TEXT,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- Invoices
CREATE TABLE IF NOT EXISTS Invoices (
    InvoiceID INTEGER PRIMARY KEY AUTOINCREMENT,
    InvoiceNumber TEXT NOT NULL UNIQUE,
    OrderID INTEGER REFERENCES Orders(OrderID),
    CustomerID INTEGER REFERENCES Customers(CustomerID),
    InvoiceDate TEXT DEFAULT (date('now')),
    DueDate TEXT,
    Status TEXT DEFAULT 'UNPAID' CHECK (Status IN ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED')),
    SubTotal REAL NOT NULL,
    DiscountAmount REAL DEFAULT 0.00,
    TaxAmount REAL NOT NULL,
    TotalAmount REAL NOT NULL,
    PaidAmount REAL DEFAULT 0.00,
    Notes TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- PurchaseOrders
CREATE TABLE IF NOT EXISTS PurchaseOrders (
    PurchaseOrderID INTEGER PRIMARY KEY AUTOINCREMENT,
    PONumber TEXT NOT NULL UNIQUE,
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    OrderDate TEXT DEFAULT (date('now')),
    ExpectedDeliveryDate TEXT,
    Status TEXT DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'APPROVED', 'RECEIVED', 'PARTIAL', 'CANCELLED')),
    WarehouseID INTEGER REFERENCES Warehouses(WarehouseID),
    OwnershipType TEXT NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    SubTotal REAL DEFAULT 0.00,
    TaxAmount REAL DEFAULT 0.00,
    TotalAmount REAL DEFAULT 0.00,
    Notes TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- PurchaseOrderItems
CREATE TABLE IF NOT EXISTS PurchaseOrderItems (
    POItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    PurchaseOrderID INTEGER REFERENCES PurchaseOrders(PurchaseOrderID) ON DELETE CASCADE,
    ProductID INTEGER REFERENCES Products(ProductID),
    Quantity REAL NOT NULL,
    UnitID INTEGER REFERENCES Units(UnitID),
    UnitPrice REAL NOT NULL,
    TaxPercent REAL DEFAULT 0.00,
    TaxAmount REAL DEFAULT 0.00,
    LineTotal REAL NOT NULL,
    ReceivedQuantity REAL DEFAULT 0.00,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- GoodsReceipts
CREATE TABLE IF NOT EXISTS GoodsReceipts (
    ReceiptID INTEGER PRIMARY KEY AUTOINCREMENT,
    ReceiptNumber TEXT NOT NULL UNIQUE,
    PurchaseOrderID INTEGER REFERENCES PurchaseOrders(PurchaseOrderID),
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    WarehouseID INTEGER REFERENCES Warehouses(WarehouseID),
    ReceiptDate TEXT DEFAULT (date('now')),
    OwnershipType TEXT NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    Status TEXT DEFAULT 'RECEIVED' CHECK (Status IN ('RECEIVED', 'INSPECTED', 'ACCEPTED', 'REJECTED')),
    Notes TEXT,
    ReceivedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- GoodsReceiptItems
CREATE TABLE IF NOT EXISTS GoodsReceiptItems (
    ReceiptItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    ReceiptID INTEGER REFERENCES GoodsReceipts(ReceiptID) ON DELETE CASCADE,
    POItemID INTEGER REFERENCES PurchaseOrderItems(POItemID),
    ProductID INTEGER REFERENCES Products(ProductID),
    QuantityReceived REAL NOT NULL,
    QuantityAccepted REAL,
    QuantityRejected REAL,
    UnitID INTEGER REFERENCES Units(UnitID),
    Notes TEXT,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- FactorySettlements
CREATE TABLE IF NOT EXISTS FactorySettlements (
    SettlementID INTEGER PRIMARY KEY AUTOINCREMENT,
    SettlementNumber TEXT NOT NULL UNIQUE,
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    SettlementDate TEXT DEFAULT (date('now')),
    PeriodFrom TEXT NOT NULL,
    PeriodTo TEXT NOT NULL,
    TotalSalesAmount REAL DEFAULT 0.00,
    TotalCommissionAmount REAL DEFAULT 0.00,
    TotalPurchaseAmount REAL DEFAULT 0.00,
    NetAmount REAL DEFAULT 0.00,
    Status TEXT DEFAULT 'DRAFT' CHECK (Status IN ('DRAFT', 'FINALIZED', 'PAID')),
    Notes TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- SettlementItems
CREATE TABLE IF NOT EXISTS SettlementItems (
    SettlementItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    SettlementID INTEGER REFERENCES FactorySettlements(SettlementID) ON DELETE CASCADE,
    ReferenceType TEXT,
    ReferenceID INTEGER,
    ProductID INTEGER REFERENCES Products(ProductID),
    Quantity REAL,
    Amount REAL,
    CommissionRate REAL,
    CommissionAmount REAL,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- CustomerContacts
CREATE TABLE IF NOT EXISTS CustomerContacts (
    ContactID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER REFERENCES Customers(CustomerID) ON DELETE CASCADE,
    ContactName TEXT NOT NULL,
    Position TEXT,
    Phone TEXT,
    Email TEXT,
    IsPrimary INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- CustomerInteractions
CREATE TABLE IF NOT EXISTS CustomerInteractions (
    InteractionID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER REFERENCES Customers(CustomerID),
    InteractionType TEXT,
    Subject TEXT,
    Notes TEXT,
    InteractionDate TEXT DEFAULT (datetime('now')),
    UserID INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- Payments
CREATE TABLE IF NOT EXISTS Payments (
    PaymentID INTEGER PRIMARY KEY AUTOINCREMENT,
    PaymentNumber TEXT NOT NULL UNIQUE,
    PaymentType TEXT NOT NULL CHECK (PaymentType IN ('RECEIPT', 'PAYMENT')),
    CustomerID INTEGER REFERENCES Customers(CustomerID),
    FactoryID INTEGER REFERENCES Factories(FactoryID),
    PaymentDate TEXT DEFAULT (date('now')),
    PaymentMethod TEXT,
    Amount REAL NOT NULL,
    ReferenceNumber TEXT,
    Notes TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- PaymentAllocations
CREATE TABLE IF NOT EXISTS PaymentAllocations (
    AllocationID INTEGER PRIMARY KEY AUTOINCREMENT,
    PaymentID INTEGER REFERENCES Payments(PaymentID) ON DELETE CASCADE,
    InvoiceID INTEGER REFERENCES Invoices(InvoiceID),
    AllocatedAmount REAL NOT NULL,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- AccountingEntries
CREATE TABLE IF NOT EXISTS AccountingEntries (
    EntryID INTEGER PRIMARY KEY AUTOINCREMENT,
    EntryDate TEXT DEFAULT (date('now')),
    ReferenceType TEXT,
    ReferenceID INTEGER,
    AccountCode TEXT NOT NULL,
    DebitAmount REAL DEFAULT 0.00,
    CreditAmount REAL DEFAULT 0.00,
    Description TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- Employees
CREATE TABLE IF NOT EXISTS Employees (
    EmployeeID INTEGER PRIMARY KEY AUTOINCREMENT,
    EmployeeCode TEXT NOT NULL UNIQUE,
    FirstName TEXT NOT NULL,
    LastName TEXT NOT NULL,
    Position TEXT,
    Department TEXT,
    HireDate TEXT,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    BasicSalary REAL DEFAULT 0.00,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Attendance
CREATE TABLE IF NOT EXISTS Attendance (
    AttendanceID INTEGER PRIMARY KEY AUTOINCREMENT,
    EmployeeID INTEGER REFERENCES Employees(EmployeeID),
    AttendanceDate TEXT NOT NULL,
    CheckInTime TEXT,
    CheckOutTime TEXT,
    HoursWorked REAL,
    Status TEXT CHECK (Status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE')),
    Notes TEXT,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(EmployeeID, AttendanceDate)
);

-- PayrollPeriods
CREATE TABLE IF NOT EXISTS PayrollPeriods (
    PeriodID INTEGER PRIMARY KEY AUTOINCREMENT,
    PeriodName TEXT NOT NULL,
    PeriodFrom TEXT NOT NULL,
    PeriodTo TEXT NOT NULL,
    Status TEXT DEFAULT 'OPEN' CHECK (Status IN ('OPEN', 'PROCESSING', 'FINALIZED', 'PAID')),
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Payroll
CREATE TABLE IF NOT EXISTS Payroll (
    PayrollID INTEGER PRIMARY KEY AUTOINCREMENT,
    PeriodID INTEGER REFERENCES PayrollPeriods(PeriodID),
    EmployeeID INTEGER REFERENCES Employees(EmployeeID),
    BasicSalary REAL NOT NULL,
    Allowances REAL DEFAULT 0.00,
    Deductions REAL DEFAULT 0.00,
    NetSalary REAL NOT NULL,
    Status TEXT DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'APPROVED', 'PAID')),
    PaymentDate TEXT,
    Notes TEXT,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(PeriodID, EmployeeID)
);

-- Vehicles
CREATE TABLE IF NOT EXISTS Vehicles (
    VehicleID INTEGER PRIMARY KEY AUTOINCREMENT,
    VehicleNumber TEXT NOT NULL UNIQUE,
    VehicleType TEXT,
    Make TEXT,
    Model TEXT,
    Year INTEGER,
    Capacity REAL,
    RegistrationNumber TEXT,
    InsuranceExpiryDate TEXT,
    LastMaintenanceDate TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Drivers
CREATE TABLE IF NOT EXISTS Drivers (
    DriverID INTEGER PRIMARY KEY AUTOINCREMENT,
    EmployeeID INTEGER REFERENCES Employees(EmployeeID),
    FirstName TEXT,
    LastName TEXT,
    LicenseNumber TEXT NOT NULL UNIQUE,
    LicenseExpiryDate TEXT,
    Phone TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Deliveries
CREATE TABLE IF NOT EXISTS Deliveries (
    DeliveryID INTEGER PRIMARY KEY AUTOINCREMENT,
    DeliveryNumber TEXT NOT NULL UNIQUE,
    OrderID INTEGER REFERENCES Orders(OrderID),
    VehicleID INTEGER REFERENCES Vehicles(VehicleID),
    DriverID INTEGER REFERENCES Drivers(DriverID),
    DeliveryDate TEXT DEFAULT (date('now')),
    DepartureTime TEXT,
    ArrivalTime TEXT,
    Status TEXT DEFAULT 'SCHEDULED' CHECK (Status IN ('SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')),
    DeliveryAddress TEXT,
    RecipientName TEXT,
    RecipientSignature TEXT,
    ProofOfDelivery TEXT,
    Notes TEXT,
    CreatedBy INTEGER,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- VehicleMaintenances
CREATE TABLE IF NOT EXISTS VehicleMaintenances (
    MaintenanceID INTEGER PRIMARY KEY AUTOINCREMENT,
    VehicleID INTEGER REFERENCES Vehicles(VehicleID),
    MaintenanceDate TEXT NOT NULL,
    MaintenanceType TEXT,
    Description TEXT,
    Cost REAL,
    NextMaintenanceDate TEXT,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE IF NOT EXISTS Users (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL UNIQUE,
    PasswordHash TEXT NOT NULL,
    Email TEXT UNIQUE,
    EmployeeID INTEGER REFERENCES Employees(EmployeeID),
    Role TEXT NOT NULL,
    IsActive INTEGER DEFAULT 1,
    LastLogin TEXT,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- Permissions
CREATE TABLE IF NOT EXISTS Permissions (
    PermissionID INTEGER PRIMARY KEY AUTOINCREMENT,
    PermissionCode TEXT NOT NULL UNIQUE,
    PermissionName TEXT NOT NULL,
    Module TEXT,
    Description TEXT,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- RolePermissions
CREATE TABLE IF NOT EXISTS RolePermissions (
    RolePermissionID INTEGER PRIMARY KEY AUTOINCREMENT,
    Role TEXT NOT NULL,
    PermissionID INTEGER REFERENCES Permissions(PermissionID),
    CreatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(Role, PermissionID)
);

-- AuditLogs
CREATE TABLE IF NOT EXISTS AuditLogs (
    AuditID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER REFERENCES Users(UserID),
    Action TEXT NOT NULL,
    TableName TEXT,
    RecordID INTEGER,
    OldValues TEXT, -- JSON stored as TEXT
    NewValues TEXT, -- JSON stored as TEXT
    IPAddress TEXT,
    UserAgent TEXT,
    CreatedAt TEXT DEFAULT (datetime('now'))
);

-- ImportJobs
CREATE TABLE IF NOT EXISTS ImportJobs (
    ImportJobID INTEGER PRIMARY KEY AUTOINCREMENT,
    JobName TEXT NOT NULL,
    EntityType TEXT NOT NULL,
    FileName TEXT,
    FilePath TEXT,
    Status TEXT DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    TotalRecords INTEGER DEFAULT 0,
    SuccessfulRecords INTEGER DEFAULT 0,
    FailedRecords INTEGER DEFAULT 0,
    ErrorLog TEXT,
    CreatedBy INTEGER REFERENCES Users(UserID),
    CreatedAt TEXT DEFAULT (datetime('now')),
    CompletedAt TEXT
);

-- ActiveSessions
CREATE TABLE IF NOT EXISTS ActiveSessions (
    SessionID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER REFERENCES Users(UserID),
    IPAddress TEXT,
    UserAgent TEXT,
    LoginTime TEXT DEFAULT (datetime('now')),
    LastActive TEXT DEFAULT (datetime('now'))
);

-- Settings
CREATE TABLE IF NOT EXISTS Settings (
    SettingID INTEGER PRIMARY KEY AUTOINCREMENT,
    SettingKey TEXT NOT NULL UNIQUE,
    SettingValue TEXT,
    SettingType TEXT DEFAULT 'string',
    Description TEXT,
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
);

-- ========================================
-- INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_product_code ON Products(ProductCode);
CREATE INDEX IF NOT EXISTS idx_product_category ON Products(CategoryID);
CREATE INDEX IF NOT EXISTS idx_product_brand ON Products(BrandID);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON Inventory(ProductID);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON Inventory(WarehouseID);
CREATE INDEX IF NOT EXISTS idx_customer_code ON Customers(CustomerCode);
CREATE INDEX IF NOT EXISTS idx_customer_type ON Customers(CustomerType);
CREATE INDEX IF NOT EXISTS idx_order_number ON Orders(OrderNumber);
CREATE INDEX IF NOT EXISTS idx_order_customer ON Orders(CustomerID);
CREATE INDEX IF NOT EXISTS idx_order_date ON Orders(OrderDate);
CREATE INDEX IF NOT EXISTS idx_order_status ON Orders(Status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON Orders(CreatedAt);

-- ========================================
-- BASE DATA
-- ========================================

-- Units
INSERT OR IGNORE INTO Units (UnitCode, UnitName, Description) VALUES
('PCS', 'Pièces', 'Pièces individuelles'),
('BOX', 'Carton', 'Carton/Colis'),
('SQM', 'M²', 'Mètre carré'),
('PAL', 'Palette', 'Palette complète');

-- Price Lists
INSERT OR IGNORE INTO PriceLists (PriceListCode, PriceListName, Description) VALUES
('RETAIL', 'Prix Détail', 'Prix de vente au détail'),
('WHOLESALE', 'Prix Gros', 'Prix de vente en gros');

-- Default Warehouse
INSERT OR IGNORE INTO Warehouses (WarehouseCode, WarehouseName, Location) VALUES
('MAIN', 'Entrepôt Principal', 'Local');

-- Default Settings
INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, SettingType, Description) VALUES
('retail_margin', '30', 'number', 'Default retail margin percentage'),
('wholesale_margin', '15', 'number', 'Default wholesale margin percentage'),
('company_name', 'Retail ERP', 'string', 'Company name'),
('currency', 'DZD', 'string', 'Currency code'),
('tax_rate', '19', 'number', 'Default tax rate percentage');

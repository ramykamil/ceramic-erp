-- ========================================
-- ALLAOUA CERAM ERP - SCRIPT D'INITIALISATION COMPLET (V2.0 FINAL)
-- VERSION MAJ AVEC TOUTES LES FONCTIONNALITÉS (DEC 2025)
-- Exécutez ce script UNE SEULE FOIS dans pgAdmin 4 pour une NOUVELLE installation
-- ========================================

-- ========================================
-- ÉTAPE 1: SUPPRIMER TOUTES LES TABLES EXISTANTES
-- ========================================

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
DROP TABLE IF EXISTS CustomerProductPrices CASCADE;
DROP TABLE IF EXISTS Customers CASCADE;
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

-- Tables additionnelles
DROP TABLE IF EXISTS CashTransactions CASCADE;
DROP TABLE IF EXISTS CashAccounts CASCADE;
DROP TABLE IF EXISTS AppSettings CASCADE;
DROP TABLE IF EXISTS ActiveSessions CASCADE;

-- Drop sequences
DROP SEQUENCE IF EXISTS orders_seq CASCADE;
DROP SEQUENCE IF EXISTS po_seq CASCADE;
DROP SEQUENCE IF EXISTS gr_seq CASCADE;
DROP SEQUENCE IF EXISTS returns_seq CASCADE;

-- Drop views
DROP MATERIALIZED VIEW IF EXISTS mv_Catalogue CASCADE;
DROP VIEW IF EXISTS vw_CurrentInventory CASCADE;
DROP VIEW IF EXISTS vw_CustomerBalances CASCADE;
DROP VIEW IF EXISTS vw_ProductPricing CASCADE;

-- ========================================
-- ÉTAPE 2: CRÉER LES SÉQUENCES
-- ========================================

CREATE SEQUENCE orders_seq START 1;
CREATE SEQUENCE po_seq START 1;
CREATE SEQUENCE gr_seq START 1;
CREATE SEQUENCE returns_seq START 1;

-- ========================================
-- ÉTAPE 3: CRÉER TOUTES LES TABLES (Dans l'ordre de dépendance)
-- ========================================

-- 1. BASE MODULES
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
    UnitCode VARCHAR(20) NOT NULL UNIQUE,
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
    Specifications JSONB,
    BasePrice DECIMAL(15,2) DEFAULT 0.00,
    PurchasePrice DECIMAL(15,2) DEFAULT 0.00,
    Size VARCHAR(50),
    Calibre VARCHAR(50),
    Choix VARCHAR(50),
    QteParColis INT DEFAULT 0,
    QteColisParPalette INT DEFAULT 0,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- 2. INVENTORY & PRICES
CREATE TABLE Inventory (
    InventoryID SERIAL PRIMARY KEY,
    ProductID INT REFERENCES Products(ProductID),
    WarehouseID INT REFERENCES Warehouses(WarehouseID),
    OwnershipType VARCHAR(20) NOT NULL CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID),
    QuantityOnHand DECIMAL(15,4) DEFAULT 0.00,
    QuantityReserved DECIMAL(15,4) DEFAULT 0.00,
    QuantityAvailable DECIMAL(15,4) GENERATED ALWAYS AS (QuantityOnHand - QuantityReserved) STORED,
    ReorderLevel DECIMAL(15,4) DEFAULT 0.00,
    MaxStockLevel DECIMAL(15,4),
    PalletCount INT DEFAULT 0,
    ColisCount INT DEFAULT 0,
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
    ReferenceType VARCHAR(50),
    ReferenceID INT,
    OwnershipType VARCHAR(20) CHECK (OwnershipType IN ('OWNED', 'CONSIGNMENT')),
    FactoryID INT REFERENCES Factories(FactoryID),
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PriceLists (
    PriceListID SERIAL PRIMARY KEY,
    PriceListCode VARCHAR(50) NOT NULL UNIQUE,
    PriceListName VARCHAR(100) NOT NULL,
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

-- 3. CUSTOMERS
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
    -- Added fiscal columns
    RC TEXT,
    AI TEXT,
    NIF TEXT,
    NIS TEXT,
    RIB TEXT,
    CreditLimit DECIMAL(15,2) DEFAULT 0.00,
    CurrentBalance DECIMAL(15,2) DEFAULT 0.00,
    PaymentTerms VARCHAR(50),
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE CustomerProductPrices (
    CustomerProductPriceID SERIAL PRIMARY KEY,
    CustomerID INT NOT NULL REFERENCES Customers(CustomerID) ON DELETE CASCADE,
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

-- 4. SALES (ORDERS & INVOICES)
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

-- 5. PURCHASING
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
    ReceivedBy INT,
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
    ReferenceType VARCHAR(50),
    ReferenceID INT,
    ProductID INT REFERENCES Products(ProductID),
    Quantity DECIMAL(15,4),
    Amount DECIMAL(15,2),
    CommissionRate DECIMAL(5,2),
    CommissionAmount DECIMAL(15,2),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. HR & EMPLOYEES
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

-- 7. ACCOUNTING
CREATE TABLE Payments (
    PaymentID SERIAL PRIMARY KEY,
    PaymentNumber VARCHAR(50) NOT NULL UNIQUE,
    PaymentType VARCHAR(20) NOT NULL CHECK (PaymentType IN ('RECEIPT', 'PAYMENT')),
    CustomerID INT REFERENCES Customers(CustomerID),
    FactoryID INT REFERENCES Factories(FactoryID),
    PaymentDate DATE DEFAULT CURRENT_DATE,
    PaymentMethod VARCHAR(50),
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
    ReferenceType VARCHAR(50),
    ReferenceID INT,
    AccountCode VARCHAR(50) NOT NULL,
    DebitAmount DECIMAL(15,2) DEFAULT 0.00,
    CreditAmount DECIMAL(15,2) DEFAULT 0.00,
    Description TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- New Accounting & Cash (From accounting_schema.sql)
CREATE TABLE CashAccounts (
    AccountID SERIAL PRIMARY KEY,
    AccountName VARCHAR(100) NOT NULL,
    Description TEXT,
    Balance DECIMAL(15,2) DEFAULT 0.00,
    IsDefault BOOLEAN DEFAULT FALSE,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE CashTransactions (
    TransactionID SERIAL PRIMARY KEY,
    AccountID INT REFERENCES CashAccounts(AccountID) ON DELETE CASCADE,
    TransactionType VARCHAR(30) NOT NULL CHECK (TransactionType IN (
        'VENTE', 'ACHAT', 'RETOUR_VENTE', 'RETOUR_ACHAT', 
        'ENCAISSEMENT', 'DECAISSEMENT', 'VERSEMENT', 'PAIEMENT', 'CHARGE', 'TRANSFERT'
    )),
    Amount DECIMAL(15,2) NOT NULL,
    Tiers VARCHAR(200),
    Motif TEXT,
    ReferenceType VARCHAR(50),
    ReferenceID INT,
    ChargeType VARCHAR(50),
    Notes TEXT,
    CreatedBy INT REFERENCES Users(UserID),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. SETTINGS & SYSTEM (From settings_schema.sql)
CREATE TABLE AppSettings (
    SettingID SERIAL PRIMARY KEY,
    CompanyName VARCHAR(100) DEFAULT 'ALLAOUA CERAM',
    Activity VARCHAR(100) DEFAULT 'MATERIAUX DE CONSTRUCTION',
    Address TEXT DEFAULT 'ZONE D''ACTIVITE -OEB-',
    Phone1 VARCHAR(20) DEFAULT '0660468894',
    Phone2 VARCHAR(20) DEFAULT '0772611126',
    Email VARCHAR(100),
    RC VARCHAR(50) DEFAULT '04/00-0406435822',
    NIF VARCHAR(50) DEFAULT '002204040643550',
    AI VARCHAR(50) DEFAULT '04010492431',
    NIS VARCHAR(50) DEFAULT '0024040406435',
    RIB VARCHAR(50),
    Capital VARCHAR(50),
    DefaultPrintFormat VARCHAR(20) DEFAULT 'TICKET',
    TicketWidth VARCHAR(10) DEFAULT '80mm',
    TicketHeader TEXT DEFAULT 'Bienvenue chez ALLAOUA CERAM',
    TicketFooter TEXT DEFAULT 'Merci pour votre confiance!',
    ShowBalanceOnTicket BOOLEAN DEFAULT TRUE,
    EnablePalletManagement BOOLEAN DEFAULT TRUE,
    UpdatePurchasePrice BOOLEAN DEFAULT TRUE,
    BarcodePrefix VARCHAR(10) DEFAULT '20',
    DefaultTaxRate DECIMAL(5,2) DEFAULT 19.00,
    DefaultTimbre DECIMAL(10,2) DEFAULT 0.00,
    -- Added Margins (From ADD_MARGIN_SETTINGS.sql)
    RetailMargin DECIMAL(5,2) DEFAULT 0.00,
    WholesaleMargin DECIMAL(5,2) DEFAULT 0.00,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy INT REFERENCES Users(UserID)
);

CREATE TABLE ActiveSessions (
    SessionID SERIAL PRIMARY KEY,
    UserID INT REFERENCES Users(UserID),
    IPAddress VARCHAR(50),
    UserAgent TEXT,
    LoginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    LastActive TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE AuditLogs (
    AuditID SERIAL PRIMARY KEY,
    UserID INT REFERENCES Users(UserID),
    Action VARCHAR(100) NOT NULL,
    TableName VARCHAR(100),
    RecordID INT,
    OldValues JSONB,
    NewValues JSONB,
    IPAddress VARCHAR(50),
    UserAgent TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ImportJobs (
    ImportJobID SERIAL PRIMARY KEY,
    JobName VARCHAR(100) NOT NULL,
    EntityType VARCHAR(50) NOT NULL,
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

-- Remaining utility tables
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

CREATE TABLE CustomerInteractions (
    InteractionID SERIAL PRIMARY KEY,
    CustomerID INT REFERENCES Customers(CustomerID),
    InteractionType VARCHAR(50),
    Subject VARCHAR(200),
    Notes TEXT,
    InteractionDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UserID INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE Vehicles (
    VehicleID SERIAL PRIMARY KEY,
    VehicleNumber VARCHAR(50) NOT NULL UNIQUE,
    VehicleType VARCHAR(50),
    Make VARCHAR(100),
    Model VARCHAR(100),
    Year INT,
    Capacity DECIMAL(10,2),
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
    FirstName VARCHAR(100),
    LastName VARCHAR(100),
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
    RecipientSignature TEXT,
    ProofOfDelivery TEXT,
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE VehicleMaintenances (
    MaintenanceID SERIAL PRIMARY KEY,
    VehicleID INT REFERENCES Vehicles(VehicleID),
    MaintenanceDate DATE NOT NULL,
    MaintenanceType VARCHAR(50),
    Description TEXT,
    Cost DECIMAL(15,2),
    NextMaintenanceDate DATE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ÉTAPE 4: VUES & DONNÉES
-- ========================================

-- Initial Data
INSERT INTO Units (UnitCode, UnitName, Description) VALUES
('PCS', 'Pièces', 'Pièces individuelles'),
('BOX', 'Carton', 'Carton/Colis'),
('SQM', 'M²', 'Mètre carré'),
('PAL', 'Palette', 'Palette complète');

INSERT INTO PriceLists (PriceListCode, PriceListName, Description) VALUES
('RETAIL', 'Prix Détail', 'Prix de vente au détail'),
('WHOLESALE', 'Prix Gros', 'Prix de vente en gros');

INSERT INTO CashAccounts (AccountName, Description, IsDefault, Balance) 
VALUES ('CAISSE PRINCIPALE', 'Compte de caisse principal', TRUE, 0.00);

INSERT INTO AppSettings (CompanyName, Activity, DefaultPrintFormat) 
SELECT 'ALLAOUA CERAM', 'MATERIAUX DE CONSTRUCTION', 'TICKET'
WHERE NOT EXISTS (SELECT 1 FROM AppSettings);

-- Views
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
    i.ColisCount,
    b.BrandName
FROM Inventory i
JOIN Products p ON i.ProductID = p.ProductID
LEFT JOIN Brands b ON p.BrandID = b.BrandID
JOIN Warehouses w ON i.WarehouseID = w.WarehouseID
LEFT JOIN Factories f ON i.FactoryID = f.FactoryID
WHERE p.IsActive = TRUE;

CREATE OR REPLACE VIEW vw_CustomerBalances AS
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

-- Materialized View (From CREATE_CATALOGUE_VIEW.sql)
CREATE MATERIALIZED VIEW mv_Catalogue AS
SELECT 
    p.ProductID, 
    p.ProductCode, 
    p.ProductName,
    LOWER(p.ProductName) as productname_lower,
    LOWER(p.ProductCode) as productcode_lower,
    b.BrandName as Famille,
    LOWER(COALESCE(b.BrandName, '')) as brandname_lower,
    p.BasePrice as PrixVente,
    p.PurchasePrice as PrixAchat,
    p.Calibre, 
    p.Choix,
    p.QteParColis, 
    p.QteColisParPalette,
    p.Size,
    COALESCE(inv.TotalQty, 0) as TotalQty,
    COALESCE(inv.NbPalette, 0) as NbPalette,
    COALESCE(inv.NbColis, 0) as NbColis,
    CASE 
        WHEN p.QteParColis > 0 THEN p.QteParColis
        WHEN COALESCE(inv.NbColis, 0) > 0 THEN ROUND(COALESCE(inv.TotalQty, 0)::numeric / COALESCE(inv.NbColis, 1)::numeric, 2)
        ELSE 0
    END as DerivedPiecesPerColis,
    CASE 
        WHEN p.QteColisParPalette > 0 THEN p.QteColisParPalette
        WHEN COALESCE(inv.NbPalette, 0) > 0 THEN ROUND(COALESCE(inv.NbColis, 0)::numeric / COALESCE(inv.NbPalette, 1)::numeric, 0)::integer
        ELSE 0
    END as DerivedColisPerPalette
FROM Products p
LEFT JOIN Brands b ON p.BrandID = b.BrandID
LEFT JOIN (
    SELECT 
        ProductID,
        SUM(QuantityOnHand) as TotalQty,
        SUM(PalletCount) as NbPalette,
        SUM(ColisCount) as NbColis
    FROM Inventory 
    WHERE OwnershipType = 'OWNED'
    GROUP BY ProductID
) inv ON p.ProductID = inv.ProductID
WHERE p.IsActive = TRUE;

-- Indexes
CREATE INDEX idx_mv_cat_name ON mv_Catalogue (productname_lower);
CREATE INDEX idx_mv_cat_code ON mv_Catalogue (productcode_lower);
CREATE INDEX idx_mv_cat_brand ON mv_Catalogue (brandname_lower);
CREATE INDEX idx_mv_cat_gin ON mv_Catalogue USING gin (productname_lower gin_trgm_ops);

-- ========================================
-- TERMINÉ
-- ========================================
SELECT 'Database Initialized Successfully' as status;

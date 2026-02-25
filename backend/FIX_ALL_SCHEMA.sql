-- =========================================================
-- SCRIPT DE RÉPARATION COMPLÈTE DE LA BASE DE DONNÉES
-- Exécutez ce script UNE SEULE FOIS dans pgAdmin 4
-- Ce script ajoute toutes les colonnes et tables manquantes
-- =========================================================

-- =========================================================
-- 1. COLONNES MANQUANTES - TABLE Products
-- =========================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchaseprice') THEN
        ALTER TABLE Products ADD COLUMN PurchasePrice DECIMAL(15,2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='calibre') THEN
        ALTER TABLE Products ADD COLUMN Calibre VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='choix') THEN
        ALTER TABLE Products ADD COLUMN Choix VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='size') THEN
        ALTER TABLE Products ADD COLUMN Size VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='qteparcolis') THEN
        ALTER TABLE Products ADD COLUMN QteParColis INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='qtecolisparpalette') THEN
        ALTER TABLE Products ADD COLUMN QteColisParPalette INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='factoryid') THEN
        ALTER TABLE Products ADD COLUMN FactoryID INT;
    END IF;
END $$;

-- =========================================================
-- 2. COLONNES MANQUANTES - TABLE Inventory
-- =========================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='palletcount') THEN
        ALTER TABLE Inventory ADD COLUMN PalletCount INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='coliscount') THEN
        ALTER TABLE Inventory ADD COLUMN ColisCount INT DEFAULT 0;
    END IF;
END $$;

-- =========================================================
-- 3. COLONNES MANQUANTES - TABLE Orders
-- =========================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='retailclientname') THEN
        ALTER TABLE Orders ADD COLUMN RetailClientName VARCHAR(200);
    END IF;
END $$;

-- =========================================================
-- 4. COLONNES MANQUANTES - TABLE OrderItems
-- =========================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orderitems' AND column_name='palletcount') THEN
        ALTER TABLE OrderItems ADD COLUMN PalletCount INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orderitems' AND column_name='coliscount') THEN
        ALTER TABLE OrderItems ADD COLUMN ColisCount INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orderitems' AND column_name='cartoncount') THEN
        ALTER TABLE OrderItems ADD COLUMN CartonCount INT DEFAULT 0;
    END IF;
END $$;

-- =========================================================
-- 5. COLONNES MANQUANTES - TABLE Users
-- =========================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN
        ALTER TABLE Users ADD COLUMN Permissions JSONB;
    END IF;
END $$;

-- =========================================================
-- 6. SÉQUENCE MANQUANTE - returns_seq
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'returns_seq') THEN
        CREATE SEQUENCE returns_seq START 1;
    END IF;
END $$;

-- =========================================================
-- 7. TABLE MANQUANTE - Returns
-- =========================================================
CREATE TABLE IF NOT EXISTS Returns (
    ReturnID SERIAL PRIMARY KEY,
    ReturnNumber VARCHAR(50) NOT NULL UNIQUE,
    OrderID INT REFERENCES Orders(OrderID),
    CustomerID INT REFERENCES Customers(CustomerID),
    ClientName VARCHAR(200),
    ClientPhone VARCHAR(50),
    ClientAddress TEXT,
    ReturnDate DATE DEFAULT CURRENT_DATE,
    Reason TEXT,
    Status VARCHAR(20) DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'APPROVED', 'PROCESSED', 'REJECTED')),
    TotalAmount DECIMAL(15,2) DEFAULT 0.00,
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- 8. TABLE MANQUANTE - ReturnItems
-- =========================================================
CREATE TABLE IF NOT EXISTS ReturnItems (
    ReturnItemID SERIAL PRIMARY KEY,
    ReturnID INT REFERENCES Returns(ReturnID) ON DELETE CASCADE,
    ProductID INT REFERENCES Products(ProductID),
    Quantity DECIMAL(15,4) NOT NULL,
    UnitID INT REFERENCES Units(UnitID),
    UnitPrice DECIMAL(15,2) DEFAULT 0.00,
    LineTotal DECIMAL(15,2) DEFAULT 0.00,
    Reason TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- 9. TABLE MANQUANTE - AppSettings
-- =========================================================
CREATE TABLE IF NOT EXISTS AppSettings (
    SettingID SERIAL PRIMARY KEY,
    CompanyName VARCHAR(200),
    Activity VARCHAR(200),
    Address TEXT,
    Phone1 VARCHAR(50),
    Phone2 VARCHAR(50),
    Email VARCHAR(100),
    RC VARCHAR(50),
    NIF VARCHAR(50),
    AI VARCHAR(50),
    NIS VARCHAR(50),
    RIB VARCHAR(100),
    Capital VARCHAR(50),
    DefaultPrintFormat VARCHAR(20) DEFAULT 'TICKET',
    TicketWidth INT DEFAULT 80,
    TicketHeader TEXT,
    TicketFooter TEXT,
    ShowBalanceOnTicket BOOLEAN DEFAULT TRUE,
    EnablePalletManagement BOOLEAN DEFAULT TRUE,
    UpdatePurchasePrice BOOLEAN DEFAULT FALSE,
    BarcodePrefix VARCHAR(20),
    DefaultTaxRate DECIMAL(5,2) DEFAULT 0.00,
    DefaultTimbre DECIMAL(15,2) DEFAULT 0.00,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy INT
);

-- =========================================================
-- 10. TABLE MANQUANTE - CashAccounts
-- =========================================================
CREATE TABLE IF NOT EXISTS CashAccounts (
    AccountID SERIAL PRIMARY KEY,
    AccountName VARCHAR(100) NOT NULL,
    Description TEXT,
    Balance DECIMAL(15,2) DEFAULT 0.00,
    IsDefault BOOLEAN DEFAULT FALSE,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insérer un compte par défaut si aucun n'existe
INSERT INTO CashAccounts (AccountName, Description, Balance, IsDefault, IsActive)
SELECT 'Caisse Principale', 'Compte de caisse principal', 0, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM CashAccounts);

-- =========================================================
-- 11. TABLE MANQUANTE - CashTransactions
-- =========================================================
CREATE TABLE IF NOT EXISTS CashTransactions (
    TransactionID SERIAL PRIMARY KEY,
    AccountID INT REFERENCES CashAccounts(AccountID),
    TransactionType VARCHAR(50) NOT NULL CHECK (TransactionType IN ('VENTE', 'ACHAT', 'RETOUR_VENTE', 'RETOUR_ACHAT', 'ENCAISSEMENT', 'DECAISSEMENT', 'VERSEMENT', 'PAIEMENT', 'CHARGE', 'TRANSFERT')),
    Amount DECIMAL(15,2) NOT NULL,
    Tiers VARCHAR(200),
    Motif TEXT,
    ReferenceType VARCHAR(50),
    ReferenceID INT,
    ChargeType VARCHAR(50),
    Notes TEXT,
    CreatedBy INT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- 12. TABLE MANQUANTE - ActiveSessions
-- =========================================================
CREATE TABLE IF NOT EXISTS ActiveSessions (
    SessionID SERIAL PRIMARY KEY,
    UserID INT REFERENCES Users(UserID),
    IPAddress VARCHAR(50),
    UserAgent TEXT,
    LoginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    LastActive TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- 13. VUE - vw_CurrentInventory (Mise à jour)
-- =========================================================
DROP VIEW IF EXISTS vw_CurrentInventory;

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
    COALESCE(i.PalletCount, 0) AS PalletCount,
    COALESCE(i.ColisCount, 0) AS ColisCount,
    b.BrandName
FROM Inventory i
JOIN Products p ON i.ProductID = p.ProductID
JOIN Warehouses w ON i.WarehouseID = w.WarehouseID
LEFT JOIN Factories f ON i.FactoryID = f.FactoryID
LEFT JOIN Brands b ON p.BrandID = b.BrandID
WHERE p.IsActive = TRUE;

-- =========================================================
-- 14. EXTENSION pg_trgm (Required for text search)
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================================
-- 15. MATERIALIZED VIEW - mv_Catalogue (Product Catalog)
-- =========================================================
DROP MATERIALIZED VIEW IF EXISTS mv_Catalogue;

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

-- Indexes for fast search on the materialized view
CREATE INDEX IF NOT EXISTS idx_mv_cat_name ON mv_Catalogue (productname_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_code ON mv_Catalogue (productcode_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_brand ON mv_Catalogue (brandname_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_famille ON mv_Catalogue (Famille);
CREATE INDEX IF NOT EXISTS idx_mv_cat_choix ON mv_Catalogue (Choix);
CREATE INDEX IF NOT EXISTS idx_mv_cat_calibre ON mv_Catalogue (Calibre);
CREATE INDEX IF NOT EXISTS idx_mv_cat_productid ON mv_Catalogue (ProductID);

-- GIN index for partial text search (LIKE '%term%')
CREATE INDEX IF NOT EXISTS idx_mv_cat_name_gin ON mv_Catalogue USING gin (productname_lower gin_trgm_ops);

-- =========================================================
-- 16. VÉRIFICATION FINALE
-- =========================================================
SELECT 'Products.Calibre' as Element, CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='calibre') THEN 'OK' ELSE 'MISSING' END as Status
UNION ALL SELECT 'Products.Choix', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='choix') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Products.PurchasePrice', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchaseprice') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Products.Size', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='size') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Products.QteParColis', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='qteparcolis') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Orders.RetailClientName', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='retailclientname') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'OrderItems.PalletCount', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orderitems' AND column_name='palletcount') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'OrderItems.ColisCount', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orderitems' AND column_name='coliscount') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'OrderItems.CartonCount', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orderitems' AND column_name='cartoncount') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Users.Permissions', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Table Returns', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='returns') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Table ReturnItems', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='returnitems') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Table AppSettings', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='appsettings') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Table CashAccounts', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cashaccounts') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Table CashTransactions', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cashtransactions') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Table ActiveSessions', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='activesessions') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'View vw_CurrentInventory', CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='vw_currentinventory') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Materialized View mv_Catalogue', CASE WHEN EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname='mv_catalogue') THEN 'OK' ELSE 'MISSING' END;

-- =========================================================
-- TERMINÉ!
-- =========================================================

-- ========================================
-- ALLAOUA CERAM ERP - SCRIPT DE RÉPARATION COMPLET (V2.0)
-- Exécutez ce script sur une installation existante pour ajouter les éléments manquants
-- SANS PERTE DE DONNÉES
-- ========================================

-- 1. Create Tables if not exist
CREATE TABLE IF NOT EXISTS AppSettings (
    SettingID SERIAL PRIMARY KEY,
    CompanyName VARCHAR(100) DEFAULT 'ALLAOUA CERAM',
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS CashTransactions (
    TransactionID SERIAL PRIMARY KEY,
    AccountID INT REFERENCES CashAccounts(AccountID) ON DELETE CASCADE,
    TransactionType VARCHAR(30),
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

CREATE TABLE IF NOT EXISTS ActiveSessions (
    SessionID SERIAL PRIMARY KEY,
    UserID INT,
    IPAddress VARCHAR(50),
    UserAgent TEXT,
    LoginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    LastActive TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add Missing Columns (Safe operations)
DO $$ 
BEGIN
    -- Customers
    ALTER TABLE Customers ADD COLUMN IF NOT EXISTS RC TEXT;
    ALTER TABLE Customers ADD COLUMN IF NOT EXISTS AI TEXT;
    ALTER TABLE Customers ADD COLUMN IF NOT EXISTS NIF TEXT;
    ALTER TABLE Customers ADD COLUMN IF NOT EXISTS NIS TEXT;
    ALTER TABLE Customers ADD COLUMN IF NOT EXISTS RIB TEXT;

    -- AppSettings
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS RetailMargin DECIMAL(5,2) DEFAULT 0.00;
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS WholesaleMargin DECIMAL(5,2) DEFAULT 0.00;
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS Activity VARCHAR(100) DEFAULT 'MATERIAUX DE CONSTRUCTION';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS Address TEXT DEFAULT 'ZONE D''ACTIVITE -OEB-';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS Phone1 VARCHAR(20) DEFAULT '0660468894';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS RC VARCHAR(50) DEFAULT '04/00-0406435822';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS NIF VARCHAR(50) DEFAULT '002204040643550';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS AI VARCHAR(50) DEFAULT '04010492431';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS NIS VARCHAR(50) DEFAULT '0024040406435';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS DefaultPrintFormat VARCHAR(20) DEFAULT 'TICKET';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS TicketWidth VARCHAR(10) DEFAULT '80mm';
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS EnablePalletManagement BOOLEAN DEFAULT TRUE;
    ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS DefaultTaxRate DECIMAL(5,2) DEFAULT 19.00;

    -- Sequences
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'gr_seq') THEN
        CREATE SEQUENCE gr_seq START 1;
    END IF;
END $$;

-- 3. Update Views
DROP MATERIALIZED VIEW IF EXISTS mv_Catalogue CASCADE;
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

CREATE INDEX IF NOT EXISTS idx_mv_cat_name ON mv_Catalogue (productname_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_code ON mv_Catalogue (productcode_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_brand ON mv_Catalogue (brandname_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_gin ON mv_Catalogue USING gin (productname_lower gin_trgm_ops);

-- 4. Insert Default Data if missing
INSERT INTO CashAccounts (AccountName, Description, IsDefault, Balance) 
SELECT 'CAISSE PRINCIPALE', 'Compte de caisse principal', TRUE, 0.00
WHERE NOT EXISTS (SELECT 1 FROM CashAccounts);

SELECT 'Fix Completed Successfully' as status;

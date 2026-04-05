-- =============================================
-- CLEAN SLATE SCRIPT - Reset All Stock Data
-- =============================================
-- WARNING: This will DELETE all transactional and product data!
-- Run this before importing fresh stock from CSV.
-- =============================================

-- 1. Clear Transactional Data (History)
TRUNCATE TABLE InventoryTransactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE OrderItems RESTART IDENTITY CASCADE;
TRUNCATE TABLE PurchaseOrderItems RESTART IDENTITY CASCADE;
TRUNCATE TABLE GoodsReceiptItems RESTART IDENTITY CASCADE;
TRUNCATE TABLE Orders RESTART IDENTITY CASCADE;
TRUNCATE TABLE PurchaseOrders RESTART IDENTITY CASCADE;
TRUNCATE TABLE Deliveries RESTART IDENTITY CASCADE;

-- 2. Clear Cash Transactions (if exists)
TRUNCATE TABLE CashTransactions RESTART IDENTITY CASCADE;

-- 3. Clear Inventory & Product Links
TRUNCATE TABLE Inventory RESTART IDENTITY CASCADE;
TRUNCATE TABLE ProductUnits RESTART IDENTITY CASCADE;
TRUNCATE TABLE CustomerProductPrices RESTART IDENTITY CASCADE;
TRUNCATE TABLE CustomerFactoryRules RESTART IDENTITY CASCADE;
TRUNCATE TABLE PriceListItems RESTART IDENTITY CASCADE;

-- 4. Clear Catalog (Products, Brands, Factories)
TRUNCATE TABLE Products RESTART IDENTITY CASCADE;
TRUNCATE TABLE Brands RESTART IDENTITY CASCADE;
TRUNCATE TABLE Factories RESTART IDENTITY CASCADE;

-- 5. Reset Sequences
ALTER SEQUENCE products_productid_seq RESTART WITH 1;
ALTER SEQUENCE brands_brandid_seq RESTART WITH 1;
ALTER SEQUENCE inventory_inventoryid_seq RESTART WITH 1;

-- 6. Add Calibre and Choix columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='calibre') THEN
        ALTER TABLE Products ADD COLUMN Calibre VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='choix') THEN
        ALTER TABLE Products ADD COLUMN Choix VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchaseprice') THEN
        ALTER TABLE Products ADD COLUMN PurchasePrice DECIMAL(15, 4) DEFAULT 0;
    END IF;
END $$;

SELECT 'Clean Slate Complete! Ready for fresh import.' AS status;

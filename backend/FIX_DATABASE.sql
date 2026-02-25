-- ========================================
-- CORRECTIF DATABASE - EXÉCUTEZ DANS PGADMIN
-- ========================================

-- 1. Ajouter la colonne PurchasePrice manquante à Products
ALTER TABLE Products ADD COLUMN IF NOT EXISTS PurchasePrice DECIMAL(15,2) DEFAULT 0.00;

-- 2. Ajouter les colonnes de packaging manquantes à Inventory (si pas déjà présentes)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='palletcount') THEN
        ALTER TABLE Inventory ADD COLUMN PalletCount INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='coliscount') THEN
        ALTER TABLE Inventory ADD COLUMN ColisCount INT DEFAULT 0;
    END IF;
END $$;

-- 3. Supprimer et recréer la vue vw_CurrentInventory
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

-- 4. Créer la vue vw_CustomerBalances si elle n'existe pas
DROP VIEW IF EXISTS vw_CustomerBalances;

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

-- 5. Vérification
SELECT 'Colonne PurchasePrice:' AS check_item, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchaseprice') 
            THEN 'OK' ELSE 'MANQUANTE' END AS status
UNION ALL
SELECT 'Vue vw_CurrentInventory:', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='vw_currentinventory') 
            THEN 'OK' ELSE 'MANQUANTE' END;

-- TERMINÉ - Les erreurs devraient être résolues

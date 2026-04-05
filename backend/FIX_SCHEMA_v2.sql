-- =========================================================
-- SCRIPT DE RÉPARATION DE LA BASE DE DONNÉES (V2)
-- Exécutez ce script dans pgAdmin 4 pour corriger les erreurs de colonnes manquantes
-- =========================================================

-- 1. Corrections de la table Products (Produits)
-- =========================================================
DO $$ 
BEGIN
    -- Ajouter PurchasePrice
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchaseprice') THEN
        ALTER TABLE Products ADD COLUMN PurchasePrice DECIMAL(15,2) DEFAULT 0.00;
    END IF;

    -- Ajouter Calibre
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='calibre') THEN
        ALTER TABLE Products ADD COLUMN Calibre VARCHAR(50);
    END IF;

    -- Ajouter Choix
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='choix') THEN
        ALTER TABLE Products ADD COLUMN Choix VARCHAR(50);
    END IF;

    -- Ajouter Size (Dimensions)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='size') THEN
        ALTER TABLE Products ADD COLUMN Size VARCHAR(50);
    END IF;

    -- Ajouter QteParColis
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='qteparcolis') THEN
        ALTER TABLE Products ADD COLUMN QteParColis INT DEFAULT 0;
    END IF;

    -- Ajouter QteColisParPalette
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='qtecolisparpalette') THEN
        ALTER TABLE Products ADD COLUMN QteColisParPalette INT DEFAULT 0;
    END IF;
END $$;

-- 2. Corrections de la table Inventory (Stock)
-- =========================================================
DO $$ 
BEGIN
    -- Ajouter PalletCount
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='palletcount') THEN
        ALTER TABLE Inventory ADD COLUMN PalletCount INT DEFAULT 0;
    END IF;

    -- Ajouter ColisCount
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='coliscount') THEN
        ALTER TABLE Inventory ADD COLUMN ColisCount INT DEFAULT 0;
    END IF;
END $$;

-- 3. Mise à jour de la vue vw_CurrentInventory
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

-- 4. Vérification finale
-- =========================================================
SELECT 'Products.Calibre' as Element, CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='calibre') THEN 'OK' ELSE 'MISSING' END as Status
UNION ALL
SELECT 'Products.Choix', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='choix') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'Products.PurchasePrice', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchaseprice') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'Inventory.PalletCount', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='palletcount') THEN 'OK' ELSE 'MISSING' END;

-- =========================================================
-- OPTIMISATION DES PERFORMANCES DU CATALOGUE
-- Exécutez ce script dans pgAdmin 4
-- =========================================================

-- 1. INDEX POUR LA RECHERCHE RAPIDE
-- Accélère la recherche par nom de produit (ILIKE)
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON Products (LOWER(ProductName));
CREATE INDEX IF NOT EXISTS idx_products_code_lower ON Products (LOWER(ProductCode));

-- 2. INDEX POUR LES FILTRES
CREATE INDEX IF NOT EXISTS idx_products_brandid ON Products (BrandID);
CREATE INDEX IF NOT EXISTS idx_products_isactive ON Products (IsActive);
CREATE INDEX IF NOT EXISTS idx_products_calibre ON Products (Calibre) WHERE Calibre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_choix ON Products (Choix) WHERE Choix IS NOT NULL;

-- 3. INDEX POUR LA JOINTURE INVENTAIRE
-- C'est le plus important pour le GROUP BY
CREATE INDEX IF NOT EXISTS idx_inventory_productid ON Inventory (ProductID);
CREATE INDEX IF NOT EXISTS idx_inventory_ownership ON Inventory (ProductID, OwnershipType);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_product ON Inventory (WarehouseID, ProductID);

-- 4. INDEX COMPOSÉ POUR LE CATALOGUE
CREATE INDEX IF NOT EXISTS idx_products_active_brand ON Products (IsActive, BrandID);

-- 5. ANALYSE DES TABLES (Force PostgreSQL à mettre à jour les statistiques)
ANALYZE Products;
ANALYZE Inventory;
ANALYZE Brands;

-- 6. VÉRIFICATION
SELECT 
    indexname, 
    tablename
FROM pg_indexes 
WHERE tablename IN ('products', 'inventory', 'brands')
ORDER BY tablename, indexname;

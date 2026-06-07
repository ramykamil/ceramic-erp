-- =============================================
-- SCRIPT DE CORRECTION : AUTORISER LES DÉCIMALES (V2.0 - ROBUST)
-- =============================================

BEGIN;

-- 1. DROP dependent views
DROP MATERIALIZED VIEW IF EXISTS mv_Catalogue CASCADE;

-- 2. Modify Products table
ALTER TABLE Products 
  ALTER COLUMN QteParColis TYPE DECIMAL(15,4),
  ALTER COLUMN QteColisParPalette TYPE DECIMAL(15,4);

-- 3. Recreate mv_Catalogue
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
        WHEN COALESCE(inv.NbColis, 0) > 0 THEN ROUND(COALESCE(inv.TotalQty, 0)::numeric / COALESCE(inv.NbColis, 1)::numeric, 4) -- Changed precision to 4
        ELSE 0
    END as DerivedPiecesPerColis,
    CASE 
        WHEN p.QteColisParPalette > 0 THEN p.QteColisParPalette
        WHEN COALESCE(inv.NbPalette, 0) > 0 THEN ROUND(COALESCE(inv.NbColis, 0)::numeric / COALESCE(inv.NbPalette, 1)::numeric, 4) -- Changed precision to 4 and removed ::integer cast
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

-- 4. Recreate Indexes
CREATE INDEX idx_mv_cat_name ON mv_Catalogue (productname_lower);
CREATE INDEX idx_mv_cat_code ON mv_Catalogue (productcode_lower);
CREATE INDEX idx_mv_cat_brand ON mv_Catalogue (brandname_lower);
-- Note: gin_trgm_ops might require pg_trgm extension. If not enabled, this might fail. 
-- Assuming it exists since it was in the original file. If not, we skip or catch?
-- We will include it as in the original.
CREATE INDEX idx_mv_cat_gin ON mv_Catalogue USING gin (productname_lower gin_trgm_ops);

COMMIT;

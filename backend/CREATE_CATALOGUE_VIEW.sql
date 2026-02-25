-- =========================================================
-- OPTIMISATION AVANCÉE - MATERIALIZED VIEW
-- Cette vue pré-calcule les stocks pour un chargement instantané
-- =========================================================

-- 1. Créer la vue matérialisée (pré-calculée)
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

-- 2. Index pour recherche ultra-rapide sur la vue
CREATE INDEX IF NOT EXISTS idx_mv_cat_name ON mv_Catalogue (productname_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_code ON mv_Catalogue (productcode_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_brand ON mv_Catalogue (brandname_lower);
CREATE INDEX IF NOT EXISTS idx_mv_cat_famille ON mv_Catalogue (Famille);
CREATE INDEX IF NOT EXISTS idx_mv_cat_choix ON mv_Catalogue (Choix);
CREATE INDEX IF NOT EXISTS idx_mv_cat_calibre ON mv_Catalogue (Calibre);
CREATE INDEX IF NOT EXISTS idx_mv_cat_productid ON mv_Catalogue (ProductID);

-- 3. Index GIN pour recherche texte partiel (LIKE '%term%')
CREATE INDEX IF NOT EXISTS idx_mv_cat_name_gin ON mv_Catalogue USING gin (productname_lower gin_trgm_ops);

-- 4. Rafraîchir la vue (à exécuter après chaque import de stock)
-- REFRESH MATERIALIZED VIEW mv_Catalogue;

SELECT 'Materialized view created with ' || COUNT(*) || ' products' as status FROM mv_Catalogue;

-- =========================================================
-- OPTIMISATION CATALOGUE - INDEXES SUPPLEMENTAIRES
-- =========================================================

-- 1. Index pour la recherche par TAILLE (Size)
-- Cela rendra la recherche "60x60" instantanée
CREATE INDEX IF NOT EXISTS idx_mv_cat_size ON mv_Catalogue (Size);

-- 2. Maintenance : Rafraîchir les stats pour que le planificateur utilise l'index
ANALYZE mv_Catalogue;

SELECT 'Index on Size created successfully' as status;

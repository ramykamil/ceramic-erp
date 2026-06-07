-- Increase precision for packing quantities to support values like 1.215
ALTER TABLE Products 
ALTER COLUMN QteParColis TYPE DECIMAL(15,4),
ALTER COLUMN QteColisParPalette TYPE DECIMAL(15,4);

-- Refresh the materialized view to reflect changes
REFRESH MATERIALIZED VIEW mv_Catalogue;

-- Add CostPrice column to OrderItems to store purchase price at time of sale
-- This enables accurate profit calculation

ALTER TABLE OrderItems ADD COLUMN IF NOT EXISTS CostPrice DECIMAL(15, 4) DEFAULT 0;

-- Add index for performance when calculating profits
CREATE INDEX IF NOT EXISTS idx_orderitems_costprice ON OrderItems(CostPrice);

-- Comment for documentation
COMMENT ON COLUMN OrderItems.CostPrice IS 'Purchase price per unit at time of sale, used for profit calculation';

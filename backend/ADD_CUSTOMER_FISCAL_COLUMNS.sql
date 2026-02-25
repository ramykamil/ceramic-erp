-- Add missing columns to Customers table for legal/fiscal info
-- Run this once in pgAdmin or psql

ALTER TABLE Customers ADD COLUMN IF NOT EXISTS RC TEXT;
ALTER TABLE Customers ADD COLUMN IF NOT EXISTS AI TEXT;
ALTER TABLE Customers ADD COLUMN IF NOT EXISTS NIF TEXT;
ALTER TABLE Customers ADD COLUMN IF NOT EXISTS NIS TEXT;
ALTER TABLE Customers ADD COLUMN IF NOT EXISTS RIB TEXT;

-- Verify columns added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customers' 
  AND column_name IN ('rc', 'ai', 'nif', 'nis', 'rib');

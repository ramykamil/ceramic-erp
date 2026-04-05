-- Fix: Change PalletCount and ColisCount from INTEGER to NUMERIC
-- This allows decimal values like 0.36 cartons to be stored

ALTER TABLE OrderItems 
ALTER COLUMN PalletCount TYPE NUMERIC(10,2) USING PalletCount::NUMERIC(10,2);

ALTER TABLE OrderItems 
ALTER COLUMN ColisCount TYPE NUMERIC(10,2) USING ColisCount::NUMERIC(10,2);

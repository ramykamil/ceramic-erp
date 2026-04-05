-- =========================================================
-- MIGRATION: Add Margin Settings
-- Run this script in pgAdmin on your Windows PC
-- =========================================================

-- Add margin columns to AppSettings
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appsettings' AND column_name='retailmargin') THEN
        ALTER TABLE AppSettings ADD COLUMN RetailMargin DECIMAL(5,2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appsettings' AND column_name='wholesalemargin') THEN
        ALTER TABLE AppSettings ADD COLUMN WholesaleMargin DECIMAL(5,2) DEFAULT 0.00;
    END IF;
END $$;

-- Verify the columns were added
SELECT 'RetailMargin' as Column, CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appsettings' AND column_name='retailmargin') THEN 'OK' ELSE 'MISSING' END as Status
UNION ALL
SELECT 'WholesaleMargin', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appsettings' AND column_name='wholesalemargin') THEN 'OK' ELSE 'MISSING' END;

-- Show current settings
SELECT SettingID, RetailMargin, WholesaleMargin FROM AppSettings LIMIT 1;

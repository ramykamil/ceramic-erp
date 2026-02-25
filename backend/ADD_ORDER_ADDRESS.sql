-- =============================================
-- UPDATE SCRIPT: ADD ADDRESS & PHONE TO ORDERS
-- =============================================

BEGIN;

-- 1. Add ShippingAddress column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='shippingaddress') THEN
        ALTER TABLE Orders ADD COLUMN ShippingAddress TEXT;
    END IF;
END $$;

-- 2. Add ClientPhone column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='clientphone') THEN
        ALTER TABLE Orders ADD COLUMN ClientPhone VARCHAR(50);
    END IF;
END $$;

COMMIT;

SELECT 'Orders table updated with Address/Phone columns.' as status;

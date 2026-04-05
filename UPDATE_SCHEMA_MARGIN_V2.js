const { Pool } = require('pg');
const path = require('path');
// Load env from backend/.env
// backend/src/scripts/ -> ../../.env
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ceramic_erp',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

async function migrate() {
    console.log('Starting Margin Types Migration...');
    console.log(`Connecting to ${process.env.DB_NAME} as ${process.env.DB_USER}...`);
    try {
        await pool.query("ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS RetailMarginType TEXT DEFAULT 'PERCENT' CHECK (RetailMarginType IN ('PERCENT', 'AMOUNT'))");
        console.log('Added RetailMarginType.');

        await pool.query("ALTER TABLE AppSettings ADD COLUMN IF NOT EXISTS WholesaleMarginType TEXT DEFAULT 'PERCENT' CHECK (WholesaleMarginType IN ('PERCENT', 'AMOUNT'))");
        console.log('Added WholesaleMarginType.');

        console.log('Success.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}
migrate();

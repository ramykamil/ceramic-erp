const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Try to load .env from multiple possible locations
const possiblePaths = [
    path.join(__dirname, '../../.env'),       // backend/src/scripts/ -> backend/.env
    path.join(__dirname, '../../../.env'),    // Project root
    path.join(__dirname, '../.env'),          // backend/src/.env (Unlikely but possible)
    path.join(process.cwd(), '.env')          // Current working directory
];

let loaded = false;
for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
        console.log(`Loading .env from: ${p}`);
        dotenv.config({ path: p });
        loaded = true;
        break; // Stop after finding the first one
    }
}

if (!loaded) {
    console.warn("WARNING: No .env file found in standard locations.");
}

// Debug output (Masking password)
console.log(`DB_HOST: ${process.env.DB_HOST || 'localhost'}`);
console.log(`DB_USER: ${process.env.DB_USER || 'postgres'}`);
console.log(`DB_NAME: ${process.env.DB_NAME || 'ceramic_erp'}`);
// console.log(`DB_PASSWORD: ${process.env.DB_PASSWORD ? '******' : 'UNDEFINED'}`);

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ceramic_erp',
    password: process.env.DB_PASSWORD, // If this is undefined, it throws the SASL error
    port: process.env.DB_PORT || 5432,
});

async function migrate() {
    console.log('Starting Margin Types Migration...');

    if (!process.env.DB_PASSWORD) {
        console.error("ERROR: DB_PASSWORD is not set. Cannot authenticate.");
        console.error("Please check your .env file in the backend folder.");
        process.exit(1);
    }

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

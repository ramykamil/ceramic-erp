const path = require('path');
const XLSX = require('xlsx');

// Adjust path to database config relative to this script
// Script is in backend/scripts/
// DB config is in backend/src/config/database.js OR backend/src/db/index.js
// seedDatabase.js uses require('../config/database') because it is in backend/src/scripts/
// We are in backend/scripts/, so we need ../src/config/database OR ../src/db/index
// Let's check listing. list_dir showed backend/src/config has database.js

let pool;
try {
    pool = require('../src/config/database');
} catch (e) {
    console.log('Could not load ../src/config/database, trying ../src/db');
    pool = require('../src/db');
}

async function dryRun() {
    console.log('Starting Dry Run...');
    const filePath = path.join(__dirname, '..', '..', "PRIX D'achat.xls");

    let workbook;
    try {
        workbook = XLSX.readFile(filePath);
    } catch (e) {
        console.error('Failed to read Excel file at ' + filePath + ':', e);
        process.exit(1);
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Read raw data
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: false });

    // Rows start at index 1 (row 2)
    const rows = data.slice(1);

    console.log(`Found ${rows.length} rows in Excel.`);

    const client = await pool.connect();
    let foundCount = 0;
    let missingCount = 0;

    try {
        console.log('Checking first 50 rows...');
        let i = 0;
        for (const row of rows) {
            i++;
            // Excel columns: 0=Famille, 1=Reference(Brand), 2=Libellé(Name), 3=Prix d'achat
            // const brand = row[1]; // Not used for matching yet
            const name = row[2];
            let priceRaw = row[3];

            if (!name) continue; // Skip empty rows

            // Clean price
            let price = 0;
            if (priceRaw) {
                // Remove " DA", commas, spaces. Handle "1 400.00" space separator too
                // remove non-numeric chars except dot
                // But comma might be decimal separator? "790.00" uses dot.
                const cleanPrice = priceRaw.toString().replace(/DA/g, '').replace(/\s/g, '').replace(/,/g, '');
                price = parseFloat(cleanPrice);
            }

            if (isNaN(price)) {
                // console.log(`Invalid price for ${name}: ${priceRaw}`);
                continue;
            }

            // Search in DB
            // We use simple name matching first
            const res = await client.query('SELECT ProductID, ProductName, PurchasePrice FROM Products WHERE LOWER(ProductName) = LOWER($1)', [name.trim()]);

            if (res.rows.length > 0) {
                const product = res.rows[0];
                if (i <= 50) console.log(`[MATCH] "${name}" -> ID: ${product.productid}. Price: ${product.purchaseprice} -> ${price}`);
                foundCount++;
            } else {
                if (i <= 50) console.log(`[MISSING] "${name}"`);
                missingCount++;
            }
        }

        console.log('------------------------------------------------');
        console.log(`Total Rows Processed: ${rows.length}`);
        console.log(`Found in DB: ${foundCount}`);
        console.log(`Missing in DB: ${missingCount}`);

    } catch (err) {
        console.error('Error during dry run:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

dryRun();

require('dotenv').config();
const xlsx = require('xlsx');
const pool = require('./src/config/database');
const path = require('path');

async function compareInventory() {
    try {
        console.log('--- Loading Excel File ---');
        // Load the Excel file provided by the user
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);

        // Assume first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const rawData = xlsx.utils.sheet_to_json(worksheet);
        console.log(`Loaded ${rawData.length} rows from Excel.\n`);

        // Connect to database
        const client = await pool.connect();

        // 1. Get all products from DB for comparison
        console.log('--- Loading Database Products ---');
        const dbProductsResult = await client.query('SELECT ProductID, ProductCode, ProductName FROM Products');
        const dbProducts = dbProductsResult.rows;
        console.log(`Loaded ${dbProducts.length} products from Online Database.\n`);

        // Create sets/maps for faster lookup
        const dbCodes = new Set(dbProducts.map(p => p.productcode?.trim().toUpperCase()));
        const dbNames = new Set(dbProducts.map(p => p.productname?.trim().toUpperCase()));

        // Analyze the Excel data
        let exactCodeMatches = 0;
        let exactNameMatches = 0;
        let noMatches = 0;

        const newProductsToImport = [];

        // We need to figure out the column names in the Excel file first.
        // Let's print the keys of the first row to understand the structure.
        if (rawData.length > 0) {
            console.log('Excel Columns Detected:', Object.keys(rawData[0]));

            // Assuming standard columns like 'Code', 'Reference', 'Designation', 'Article', etc.
            // We will dynamically try to find the code and name columns
            const firstRow = rawData[0];
            const keys = Object.keys(firstRow);

            const codeCol = 'Reference';
            const nameCol = 'Libellé';

            console.log(`Using Code Column: '${codeCol}'`);
            console.log(`Using Name Column: '${nameCol}'\n`);

            for (const row of rawData) {
                const excelCode = row[codeCol]?.toString().trim().toUpperCase() || '';
                const excelName = row[nameCol]?.toString().trim().toUpperCase() || '';

                let matched = false;

                if (excelCode && dbCodes.has(excelCode)) {
                    exactCodeMatches++;
                    matched = true;
                } else if (excelName && dbNames.has(excelName)) {
                    exactNameMatches++;
                    matched = true;
                }

                if (!matched && excelName) {
                    noMatches++;
                    newProductsToImport.push(excelName);
                }
            }
        }

        console.log('--- Comparison Results ---');
        console.log(`Exact Code Matches : ${exactCodeMatches}`);
        console.log(`Exact Name Matches : ${exactNameMatches}`);
        console.log(`Total Excel Found in DB : ${exactCodeMatches + exactNameMatches}`);
        console.log(`BRAND NEW Products (Not in DB) : ${noMatches}`);

        if (noMatches > 0) {
            console.log('\nSample of 5 NEW products to be imported:');
            console.log(newProductsToImport.slice(0, 5));
        }

        client.release();
    } catch (err) {
        console.error('Error during comparison:', err);
    } finally {
        pool.end();
    }
}

compareInventory();

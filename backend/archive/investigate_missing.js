require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Helper function to normalize strings for comparison
const normalize = (str) => {
    if (!str) return '';
    return str.toString()
        .toLowerCase()
        .replace(/\s+/g, '') // remove all whitespace
        .trim();
};

async function investigateMissing() {
    const client = await pool.connect();
    try {
        console.log('--- Loading Excel File ---');
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        console.log(`Loaded ${rawData.length} rows from Excel.\n`);

        console.log('--- Loading Database Products ---');
        const dbQuery = `
            SELECT ProductID, ProductCode, ProductName 
            FROM Products 
            WHERE IsActive = true
        `;
        const dbProductsResult = await client.query(dbQuery);
        const dbProducts = dbProductsResult.rows;
        console.log(`Loaded ${dbProducts.length} active products from Online Database.\n`);

        // Create standard lookup maps
        const dbByCode = new Map();
        const dbByName = new Map();

        // Create normalized lookup maps
        const dbByCodeNorm = new Map();
        const dbByNameNorm = new Map();

        dbProducts.forEach(p => {
            if (p.productcode) {
                dbByCode.set(p.productcode.trim().toUpperCase(), p);
                dbByCodeNorm.set(normalize(p.productcode), p);
            }
            if (p.productname) {
                dbByName.set(p.productname.trim().toUpperCase(), p);
                dbByNameNorm.set(normalize(p.productname), p);
            }
        });

        const missing = [];
        let fuzzyCodeMatches = 0;
        let fuzzyNameMatches = 0;

        const sampleFuzzy = [];
        const sampleTrulyMissing = [];

        for (const row of rawData) {
            const excelCode = row['Reference']?.toString().trim().toUpperCase() || '';
            const excelName = row['Libellé']?.toString().trim().toUpperCase() || '';
            const normExcelCode = normalize(excelCode);
            const normExcelName = normalize(excelName);

            // Attempt standard Match
            let dbProduct = dbByCode.get(excelCode);
            if (!dbProduct && excelName) {
                dbProduct = dbByName.get(excelName);
            }

            if (!dbProduct) {
                // Not found by standard match. Try fuzzy match.
                let fuzzyMatch = dbByCodeNorm.get(normExcelCode);
                if (fuzzyMatch) {
                    fuzzyCodeMatches++;
                    if (sampleFuzzy.length < 5) sampleFuzzy.push(`EXCEL: [${excelCode}] ${excelName} -> DB: [${fuzzyMatch.productcode}] ${fuzzyMatch.productname} (Matched by Normalized Code)`);
                } else if (normExcelName) {
                    fuzzyMatch = dbByNameNorm.get(normExcelName);
                    if (fuzzyMatch) {
                        fuzzyNameMatches++;
                        if (sampleFuzzy.length < 5) sampleFuzzy.push(`EXCEL: [${excelCode}] ${excelName} -> DB: [${fuzzyMatch.productcode}] ${fuzzyMatch.productname} (Matched by Normalized Name)`);
                    }
                }

                if (!fuzzyMatch) {
                    missing.push({ code: excelCode, name: excelName });
                    if (sampleTrulyMissing.length < 10) sampleTrulyMissing.push(`[${excelCode}] ${excelName}`);
                }
            }
        }

        console.log('--- Missing Products Analysis ---');
        console.log(`Total Unmatched (Standard): ${fuzzyCodeMatches + fuzzyNameMatches + missing.length}`);
        console.log(`Recoverable via Fuzzy Search (Spaces/Case Diff): ${fuzzyCodeMatches + fuzzyNameMatches} (${fuzzyCodeMatches} by Code, ${fuzzyNameMatches} by Name)`);
        console.log(`TRULY MISSING from active DB: ${missing.length}\n`);

        console.log('--- Sample Recoverable (Fuzzy Matches) ---');
        sampleFuzzy.forEach(m => console.log(m));

        console.log('\n--- Sample Truly Missing ---');
        sampleTrulyMissing.forEach(m => console.log(m));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

investigateMissing();

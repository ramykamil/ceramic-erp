const XLSX = require('xlsx');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ceramic_erp',
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5432,
});

async function analyze() {
    try {
        // 1. Read Excel
        const filePath = path.join(__dirname, '..', '..', "PRIX D'achat.xls");
        console.log('Reading Excel:', filePath);
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        const excelProducts = new Map();
        data.forEach(row => {
            if (row['Libellé'] && row["Prix d'achat"]) {
                const name = row['Libellé'].toString().trim();
                const priceStr = row["Prix d'achat"].toString().replace('DA', '').replace(/\s/g, '').replace(',', '').trim();
                excelProducts.set(name, priceStr);
            }
        });

        console.log(`Excel loaded: ${excelProducts.size} products.`);

        // 2. Read DB
        const res = await pool.query('SELECT ProductID, ProductName, PurchasePrice FROM Products');
        const dbProducts = res.rows;
        console.log(`DB loaded: ${dbProducts.length} products.`);

        // 3. Compare
        let matched = 0;
        let unmatchedDB = 0;
        const unmatchedExcel = new Set(excelProducts.keys());
        const potentialMatches = [];

        dbProducts.forEach(p => {
            const dbName = p.productname.trim();
            if (excelProducts.has(dbName)) {
                matched++;
                unmatchedExcel.delete(dbName);
            } else {
                unmatchedDB++;
                // Try to find a fuzzy match or substring match
                for (const [excelName, price] of excelProducts.entries()) {
                    if (dbName.toLowerCase().includes(excelName.toLowerCase()) ||
                        excelName.toLowerCase().includes(dbName.toLowerCase())) {
                        potentialMatches.push({ db: dbName, excel: excelName });
                        break; // Just find one to save space
                    }
                }
            }
        });

        console.log('\n--- Analysis Results ---');
        console.log(`Exact Matches: ${matched}`);
        console.log(`Products in DB with NO exact match in Excel: ${unmatchedDB}`);
        console.log(`Products in Excel with NO exact match in DB: ${unmatchedExcel.size}`);

        console.log('\n--- Potential "Close" Matches (First 20) ---');
        potentialMatches.slice(0, 20).forEach(m => {
            console.log(`DB: "${m.db}"  <-->  Excel: "${m.excel}"`);
        });

        console.log('\n--- Sample Unmatched DB Products (First 10) ---');
        const unmatchedDBList = dbProducts.filter(p => !excelProducts.has(p.productname.trim())).slice(0, 10);
        unmatchedDBList.forEach(p => console.log(`"${p.productname}"`));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

analyze();

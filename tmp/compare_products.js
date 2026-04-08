const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const STOCK_FILE = 'stock06-04F.xlsx';
const CATALOGUE_FILE = 'catalogue_produits_2026-04-08.xlsx';
const OUTPUT_FILE = 'missing_products.xlsx';

function normalize(str) {
    if (!str) return '';
    return str.toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

async function compare() {
    console.log(`Loading ${STOCK_FILE}...`);
    const stockWorkbook = XLSX.readFile(STOCK_FILE);
    const stockSheet = stockWorkbook.Sheets[stockWorkbook.SheetNames[0]];
    const stockData = XLSX.utils.sheet_to_json(stockSheet);

    console.log(`Loading ${CATALOGUE_FILE}...`);
    const catWorkbook = XLSX.readFile(CATALOGUE_FILE);
    const catSheet = catWorkbook.Sheets[catWorkbook.SheetNames[0]];
    const catData = XLSX.utils.sheet_to_json(catSheet);

    console.log(`Analyzing data...`);
    
    // Create a map of existing products in catalogue for fast lookup
    // Using Normalized Label as key
    const catMap = new Map();
    catData.forEach(item => {
        const label = normalize(item['Libellé']);
        if (label) {
            catMap.set(label, item);
        }
    });

    const missingProducts = [];
    const duplicatesInStock = [];
    const foundInStock = new Set();

    stockData.forEach(item => {
        const label = normalize(item['Libellé']);
        if (!label) return;

        if (foundInStock.has(label)) {
            duplicatesInStock.push(item);
            return;
        }
        foundInStock.add(label);

        if (!catMap.has(label)) {
            missingProducts.push(item);
        }
    });

    console.log(`Comparison Complete!`);
    console.log(`- Total products in stock reference: ${stockData.length}`);
    console.log(`- Total unique products in stock reference: ${foundInStock.size}`);
    console.log(`- Total products in online catalogue: ${catData.length}`);
    console.log(`- Missing products identified: ${missingProducts.length}`);

    if (missingProducts.length > 0) {
        // Create new workbook with missing products
        const newWb = XLSX.utils.book_new();
        const newWs = XLSX.utils.json_to_sheet(missingProducts);
        XLSX.utils.book_append_sheet(newWb, newWs, "Missing Products");
        XLSX.writeFile(newWb, OUTPUT_FILE);
        console.log(`Missing products saved to ${OUTPUT_FILE}`);
        
        // Also save a JSON for the AI to display
        fs.writeFileSync('tmp/missing_summary.json', JSON.stringify(missingProducts.slice(0, 50), null, 2));
    } else {
        console.log("No missing products found!");
    }
}

compare().catch(err => {
    console.error("Error during comparison:", err);
    process.exit(1);
});

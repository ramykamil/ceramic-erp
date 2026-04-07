const fs = require('fs');
const path = require('path');
// Locate xlsx from the backend node_modules
const XLSX = require('./backend/node_modules/xlsx');

function cleanValue(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    // Handle text-formatted prices: remove spaces, "DA", replace commas with dots
    let s = String(val).replace(/\s/g, '').replace(/,/g, '.').replace(/DA/gi, '').replace(/[^\d.]/g, '');
    let f = parseFloat(s);
    return isNaN(f) ? 0 : f;
}

function extractRefinedData() {
    const filePath = 'stock06-04F.xlsx';
    if (!fs.existsSync(filePath)) {
        console.error('Excel file not found at ' + filePath);
        process.exit(1);
    }

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const results = [];
    // Skip the first few rows (headers usually end around row 2 or 3)
    data.forEach((row, i) => {
        if (i < 2) return; 

        // Column Mapping based on visual inspection:
        // A: Supplier (row[0])
        // C: Product Name (row[2])
        // F: Stock Quantity (row[5])
        // H: Purchase Price / Achat (row[7])
        // I: Sale Price / Vente (row[8])
        // L: QPC / Qte par Carton (row[11])
        // M: CPP / Carton par Palette (row[12])

        const supplier = String(row[0] || '').trim();
        const productName = String(row[2] || '').trim();

        if (!productName || productName.toLowerCase().includes('total')) return;

        results.push({
            supplier,
            productName,
            qte: cleanValue(row[5]),
            purchasePrice: cleanValue(row[7]),
            salePrice: cleanValue(row[8]),
            qpc: cleanValue(row[11]),
            cpp: cleanValue(row[12]),
            fullName: `${supplier} - ${productName}`.trim()
        });
    });

    fs.writeFileSync('excel_data_refined.json', JSON.stringify(results, null, 2));
    console.log(`Successfully extracted ${results.length} products to excel_data_refined.json`);

    // Verification check for the specific product mentioned by the user
    const check = results.find(p => p.productName.includes('CONCRETE GRIS 45/45') && p.supplier.includes('TECHNO'));
    if (check) {
        console.log('--- VERIFICATION: TECHNO CERAM - CONCRETE GRIS 45/45 ---');
        console.log(JSON.stringify(check, null, 2));
    }
}

extractRefinedData();

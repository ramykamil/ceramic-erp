const XLSX = require('xlsx');
const fs = require('fs');

const files = [
    'stock06-04F.xlsx',
    'catalogue_produits_2026-04-08.xlsx'
];

const results = {};

files.forEach(file => {
    try {
        const workbook = XLSX.readFile(file);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        results[file] = {
            headers: data[0],
            sample: data.slice(1, 4)
        };
    } catch (error) {
        results[file] = { error: error.message };
    }
});

fs.writeFileSync('tmp/inspection_results.json', JSON.stringify(results, null, 2));
console.log('Inspection results written to tmp/inspection_results.json');

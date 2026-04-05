const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', "PRIX D'achat.xls");

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Read first 20 rows
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: false });

    console.log('Headers:', data[0]);
    for (let i = 1; i < 20; i++) {
        console.log(`Row ${i + 1}:`, data[i]);
    }

} catch (error) {
    console.error('Error:', error);
}

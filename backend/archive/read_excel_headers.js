const xlsx = require('xlsx');
const path = require('path');

// The excel file is one directory up
const filePath = path.join(__dirname, '..', 'Table Produit NOUVEAUX.xls');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
console.log('Total Rows:', data.length);
console.log('Headers:');
console.log(JSON.stringify(data[0], null, 2));
console.log('Row 1:');
console.log(JSON.stringify(data[1], null, 2));
console.log('Row 2:');
console.log(JSON.stringify(data[2], null, 2));

const xlsx = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });

const matchingRows = rawData.filter(row =>
    row['Libellé'] && row['Libellé'].toString().toUpperCase().includes('CONCRETE GRIS 45/45')
);

console.log("Excel Rows for CONCRETE GRIS 45/45:");
console.log(matchingRows);

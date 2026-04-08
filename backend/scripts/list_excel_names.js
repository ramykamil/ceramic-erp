const XLSX = require('xlsx');
const path = require('path');

const filePath = 'c:/Users/Ramy Kamil Mecheri/Desktop/ceramic-erp-main/ceramic-erp-main/missing_products.xlsx';

try {
  const workbook = XLSX.readFile(filePath);
  console.log('Sheets:', workbook.SheetNames);
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log('Total Rows:', data.length);
  console.log('Names in Excel:');
  data.forEach((row, i) => {
    console.log(`${i+1}: ${row['Libellé']} (${row['Reference']})`);
  });
} catch (err) {
  console.error('Error:', err.message);
}

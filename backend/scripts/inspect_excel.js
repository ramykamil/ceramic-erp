const xlsx = require('xlsx');
const path = require('path');

const excelPath = path.resolve(__dirname, '../../SOLDE NV NV.xls');

try {
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  console.log(`Reading sheet: ${sheetName}`);
  
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log('Headers:');
  console.log(data[0]);
  
  console.log('\nFirst 5 rows:');
  for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
    console.log(data[i]);
  }
} catch (error) {
  console.error('Error reading Excel file:', error.message);
}

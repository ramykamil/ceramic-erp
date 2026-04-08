const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || 'missing_products.xlsx';

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  // Take first 5 for preview
  const preview = data.slice(0, 5);
  const info = {
    totalRows: data.length,
    headers: Object.keys(data[0] || {}),
    preview: preview
  };

  console.log(JSON.stringify(info, null, 2));
} catch (err) {
  console.error('Error reading excel:', err.message);
  process.exit(1);
}

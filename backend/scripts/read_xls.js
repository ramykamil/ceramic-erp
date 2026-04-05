const xlsx = require('xlsx');
const path = require('path');
const file = 'c:/Users/PC/Desktop/ceramic-erp-platform/ceramic-erp-platform/STOCK LYOUM.xls';
const workbook = xlsx.readFile(file, { type: 'file', cellDates: true });
const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = xlsx.utils.sheet_to_json(firstSheet, { defval: "", raw: true });
if (jsonData.length > 0) {
    console.log("Keys of the first row:");
    console.log(Object.keys(jsonData[0]));
    console.log("First row data:");
    console.log(jsonData[0]);
} else {
    console.log("Empty sheet.");
}

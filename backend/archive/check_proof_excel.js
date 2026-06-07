const xlsx = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '../Verification_Quantites_Match_1772584358518.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });

const differences = rawData.filter(row => row['Statut Correspondance'] === '❌ DIFFÉRENCE');
console.log(`Total rows checked: ${rawData.length}`);
console.log(`Perfect Matches: ${rawData.length - differences.length}`);
console.log(`Differences found: ${differences.length}`);
if (differences.length > 0) {
    console.log("Difference examples:", differences.slice(0, 3));
}

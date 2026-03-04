const xlsx = require('xlsx');
const path = require('path');

const outputPath = path.resolve(__dirname, `../Rapport_Final_Nettoyage.xlsx`);

try {
    const workbook = xlsx.readFile(outputPath);
    console.log("Sheet Names in file:", workbook.SheetNames);

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        console.log(`Sheet "${sheetName}" contains ${rawData.length} rows.`);
        if (rawData.length > 0) {
            console.log(`First row in "${sheetName}":`, rawData[0]);
        }
    }
} catch (e) {
    console.error("Error reading file:", e);
}

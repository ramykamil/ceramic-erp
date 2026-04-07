const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(process.cwd(), 'stock06-04F.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

console.log("Headers found:", Object.keys(data[0]));
console.log("First 3 rows sample:", JSON.stringify(data.slice(0, 3), null, 2));

const productMap = new Map();
const duplicates = [];

data.forEach((row, index) => {
    // Attempt to find the most likely product code column
    const code = row["CODE"] || row["Code"] || row["Référence"] || row["Ref"] || row["__EMPTY"];
    if (code) {
        const cleanCode = String(code).trim();
        if (productMap.has(cleanCode)) {
            duplicates.push({ 
                code: cleanCode, 
                firstRow: productMap.get(cleanCode).index, 
                firstQty: productMap.get(cleanCode).qty,
                secondRow: index + 2, 
                secondQty: row["QUANTITE"] || row["Qté"] || row["Stock"] || row["__EMPTY_1"]
            });
        }
        productMap.set(cleanCode, { index: index + 2, qty: row["QUANTITE"] || row["Qté"] || row["Stock"] || row["__EMPTY_1"] });
    }
});

console.log("\nDuplicates found:", JSON.stringify(duplicates.slice(0, 20), null, 2));

const xlsx = require('xlsx');
const path = require('path');

try {
    const filePath = path.resolve(__dirname, '../difference.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    console.log(`Loaded ${data.length} rows from difference.xlsx\n`);

    if (data.length > 0) {
        console.log('Sample format:', JSON.stringify(data[0], null, 2));
        console.log('\nFirst 5 mismatches:');
        data.slice(0, 5).forEach((row, i) => {
            console.log(`${i + 1}.`, row);
        });
    }
} catch (err) {
    console.error('Error reading difference.xlsx:', err);
}

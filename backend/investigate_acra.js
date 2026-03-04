require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log("--- Checking Database ---");
        const dbResult = await pool.query(`
            SELECT ProductID, ProductCode, ProductName, IsActive, CreatedAt, UpdatedAt
            FROM Products 
            WHERE ProductName ILIKE '%ACRA GRIS RELIEFE%' OR ProductCode ILIKE '%ACRA GRIS RELIEFE%'
        `);
        console.log(`Found ${dbResult.rowCount} rows in DB:`);
        console.table(dbResult.rows);

        console.log("\n--- Checking Excel File ---");
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });

        const excelMatches = rawData.filter(row => {
            const name = row['Libellé']?.toString().toUpperCase() || '';
            const ref = row['Reference']?.toString().toUpperCase() || '';
            return name.includes('ACRA GRIS RELIEFE') || ref.includes('ACRA GRIS RELIEFE');
        });

        console.log(`Found ${excelMatches.length} rows in Excel:`);
        if (excelMatches.length > 0) {
            console.log(excelMatches);
        }

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();

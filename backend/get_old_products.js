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
        console.log("--- Fetching Products Created Before February ---");
        const result = await pool.query(`
            SELECT 
                ProductID, 
                ProductCode, 
                ProductName, 
                IsActive, 
                CreatedAt, 
                UpdatedAt
            FROM Products 
            WHERE CreatedAt < '2026-02-01'
            ORDER BY CreatedAt ASC
        `);

        console.log(`Found ${result.rowCount} products created before February.`);

        if (result.rowCount > 0) {
            // Generate Excel file
            const newWorkbook = xlsx.utils.book_new();
            const newWorksheet = xlsx.utils.json_to_sheet(result.rows);

            const wscols = [
                { wch: 10 }, // ProductID
                { wch: 30 }, // ProductCode
                { wch: 40 }, // ProductName
                { wch: 10 }, // IsActive
                { wch: 25 }, // CreatedAt
                { wch: 25 }  // UpdatedAt
            ];
            newWorksheet['!cols'] = wscols;

            xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, "Anciens Produits");

            const outputPath = path.resolve(__dirname, `../Anciens_Produits_Avant_Fevrier.xlsx`);
            xlsx.writeFile(newWorkbook, outputPath);

            console.log(`✅ Excel file generated successfully at:\n${outputPath}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();

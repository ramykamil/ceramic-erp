require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

async function generateExcelReport() {
    const pool = new Pool({
        connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
    });

    try {
        console.log('Fetching customers from database...');
        const res = await pool.query('SELECT customerid, customername, currentbalance FROM customers');
        const dbCustomers = res.rows || res; 

        console.log(`Found ${dbCustomers.length} customers in database.`);

        const excelPath = path.resolve(__dirname, '../../SOLDE NV NV.xls');
        if (!fs.existsSync(excelPath)) {
            throw new Error(`Excel file not found at ${excelPath}`);
        }

        console.log(`Reading Excel file: ${excelPath}`);
        const workbook = xlsx.readFile(excelPath);
        
        let excelData = [];
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet);
            excelData = excelData.concat(data);
        });

        console.log(`Read ${excelData.length} records from Excel file.`);

        const matches = [];
        const unmatchedExcel = [];
        const unmatchedDb = [...dbCustomers];

        const normalize = (str) => {
            if (!str) return '';
            return str.toString().toLowerCase().trim().replace(/\s+/g, ' ');
        };

        excelData.forEach(row => {
            const excelName = row['Nom'];
            if (!excelName) return;

            const normalizedExcelName = normalize(excelName);
            const excelSoldeRaw = row['Solde'];
            const excelSolde = parseFloat(excelSoldeRaw) || 0;

            const dbMatchIndex = unmatchedDb.findIndex(c => {
                const dbName = c.customername;
                return normalize(dbName) === normalizedExcelName;
            });
            
            if (dbMatchIndex !== -1) {
                const dbMatch = unmatchedDb[dbMatchIndex];
                const dbBal = parseFloat(dbMatch.currentbalance) || 0;
                matches.push({
                    'Status': 'MATCH',
                    'DB Customer ID': dbMatch.customerid,
                    'DB Name': dbMatch.customername,
                    'Excel Name': excelName,
                    'DB Balance': dbBal,
                    'Excel Balance': Math.abs(excelSolde),
                    'Difference': Math.abs(excelSolde) - dbBal
                });
                unmatchedDb.splice(dbMatchIndex, 1);
            } else {
                unmatchedExcel.push({
                    'Status': 'EXCEL_ONLY',
                    'DB Customer ID': '',
                    'DB Name': '',
                    'Excel Name': excelName,
                    'DB Balance': 0,
                    'Excel Balance': excelSolde,
                    'Difference': excelSolde
                });
            }
        });

        const dbOnly = unmatchedDb.map(dbMatch => {
            const dbBal = parseFloat(dbMatch.currentbalance) || 0;
            return {
                'Status': 'DB_ONLY',
                'DB Customer ID': dbMatch.customerid,
                'DB Name': dbMatch.customername,
                'Excel Name': '',
                'DB Balance': dbBal,
                'Excel Balance': 0,
                'Difference': -dbBal
            };
        });

        // Combine arrays: Matches first, then DB only, then Excel only
        const allData = [...matches, ...dbOnly, ...unmatchedExcel];

        const outWorkbook = xlsx.utils.book_new();
        const outSheet = xlsx.utils.json_to_sheet(allData);
        xlsx.utils.book_append_sheet(outWorkbook, outSheet, 'Comparison_Report');

        const outPath = path.resolve(__dirname, 'Full_Comparison_Report.xlsx');
        xlsx.writeFile(outWorkbook, outPath);

        console.log(`\nSuccessfully generated Excel report: ${outPath}`);
        console.log(`- MATCHES: ${matches.length}`);
        console.log(`- DB_ONLY: ${dbOnly.length}`);
        console.log(`- EXCEL_ONLY: ${unmatchedExcel.length}`);

    } catch (error) {
        console.error('Error during generation:', error);
    } finally {
        await pool.end();
    }
}

generateExcelReport();

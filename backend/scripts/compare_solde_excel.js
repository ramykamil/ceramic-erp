require('dotenv').config();
// Override DB_NAME for the script since the live DB name is 'postgres' per .env
process.env.DB_NAME = 'postgres';
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

async function compareSolde() {
    const pool = new Pool({
        connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
    });
    try {
        console.log('Fetching customers from database...');
        // Handle both SQLite and PostgreSQL return formats
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

        // Normalize string for comparison
        const normalize = (str) => {
            if (!str) return '';
            return str.toString().toLowerCase().trim().replace(/\s+/g, ' ');
        };

        excelData.forEach(row => {
            const excelName = row['Nom'];
            if (!excelName) return; // Skip empty rows

            const normalizedExcelName = normalize(excelName);
            // Some soldes might be strings or empty
            const excelSoldeRaw = row['Solde'];
            const excelSolde = parseFloat(excelSoldeRaw) || 0;

            const dbMatchIndex = unmatchedDb.findIndex(c => {
                const dbName = c.customername || c.CustomerName;
                return normalize(dbName) === normalizedExcelName;
            });
            
            if (dbMatchIndex !== -1) {
                const dbMatch = unmatchedDb[dbMatchIndex];
                const dbBal = parseFloat(dbMatch.currentbalance || dbMatch.CurrentBalance) || 0;
                matches.push({
                    CustomerID: dbMatch.customerid || dbMatch.CustomerID,
                    CustomerName: dbMatch.customername || dbMatch.CustomerName,
                    ExcelName: excelName,
                    DB_CurrentBalance: dbBal,
                    Excel_Solde: Math.abs(excelSolde), 
                    Original_Excel_Solde: excelSoldeRaw,
                    Difference: Math.abs(excelSolde) - dbBal
                });
                // Remove from unmatchedDb
                unmatchedDb.splice(dbMatchIndex, 1);
            } else {
                unmatchedExcel.push({
                    ExcelName: excelName,
                    Excel_Solde: excelSolde,
                    Original_Excel_Solde: excelSoldeRaw
                });
            }
        });

        const reportPath = path.resolve(__dirname, 'solde_comparison_report.json');
        
        const report = {
            summary: {
                totalDatabaseCustomers: dbCustomers.length,
                totalExcelRecordsRead: excelData.length,
                exactNameMatchesFound: matches.length,
                unmatchedExcelRecords: unmatchedExcel.length,
                unmatchedDatabaseRecords: unmatchedDb.length
            },
            matches: matches,
            unmatchedExcel: unmatchedExcel,
            unmatchedDb: unmatchedDb
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Write a markdown version for easier reading
        const mdPath = path.resolve(__dirname, 'solde_comparison_report.md');
        let mdContent = `# Solde Comparison Report\n\n`;
        mdContent += `## Summary\n`;
        mdContent += `- Total Database Customers: ${dbCustomers.length}\n`;
        mdContent += `- Total Excel Records Read: ${excelData.length}\n`;
        mdContent += `- Exact Name Matches Found: ${matches.length}\n`;
        mdContent += `- Unmatched Excel Records: ${unmatchedExcel.length}\n`;
        mdContent += `- Unmatched Database Records: ${unmatchedDb.length}\n\n`;
        
        mdContent += `## Matches (Differences > 0)\n`;
        mdContent += `| Customer ID | DB Name | Excel Name | DB Balance | Excel Solde | Difference |\n`;
        mdContent += `|---|---|---|---|---|---|\n`;
        const diffMatches = matches.filter(m => Math.abs(m.Difference) > 0.01);
        diffMatches.forEach(m => {
            mdContent += `| ${m.CustomerID} | ${m.CustomerName} | ${m.ExcelName} | ${m.DB_CurrentBalance} | ${m.Excel_Solde} | ${m.Difference.toFixed(2)} |\n`;
        });
        if (diffMatches.length === 0) mdContent += `| No differences found! | | | | | |\n`;
        
        mdContent += `\n## Matches (No Difference)\n`;
        mdContent += `Found ${matches.length - diffMatches.length} matching customers with identical balances.\n`;
        
        mdContent += `\n## Unmatched Excel Records (Top 20)\n`;
        mdContent += `| Excel Name | Balance |\n`;
        mdContent += `|---|---|\n`;
        unmatchedExcel.slice(0, 20).forEach(m => {
            mdContent += `| ${m.ExcelName} | ${m.Excel_Solde} |\n`;
        });

        fs.writeFileSync(mdPath, mdContent);

        console.log('====================================================');
        console.log('COMPARISON SUMMARY:');
        console.log(`Total Database Customers: ${dbCustomers.length}`);
        console.log(`Total Excel Records Found: ${excelData.length}`);
        console.log(`Exact Name Matches: ${matches.length}`);
        console.log(`Unmatched Excel Records: ${unmatchedExcel.length}`);
        console.log(`Matches With Differences: ${diffMatches.length}`);
        console.log('====================================================');
        console.log(`JSON report saved to: ${reportPath}`);
        console.log(`Markdown report saved to: ${mdPath}`);
        
    } catch (error) {
        console.error('Error during comparison:', error);
    } finally {
        if (pool) await pool.end();
    }
}

compareSolde();

const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

async function extractUpdates() {
    try {
        const excelPath = path.resolve(__dirname, 'Full_Comparison_Report.xlsx');
        if (!fs.existsSync(excelPath)) {
            throw new Error(`Excel file not found at ${excelPath}`);
        }

        console.log(`Reading Updated Excel file: ${excelPath}`);
        const workbook = xlsx.readFile(excelPath);
        
        const sheetName = workbook.SheetNames[0]; // Comparison_Report
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const updates = [];

        data.forEach(row => {
            const customerId = row['DB Customer ID'];
            const customerName = row['DB Name'];
            
            // We only care about rows that have a DB Customer ID
            if (customerId) {
                // If they mapped a new Excel Name / Balance manually, use Excel Balance
                // We'll propose the 'Excel Balance' as the new Solde for the user to review
                const excelBalance = parseFloat(row['Excel Balance']) || 0;
                const dbBalance = parseFloat(row['DB Balance']) || 0;
                
                // Track all DB customers, highlighting if there's a change or not
                updates.push({
                    CustomerID: customerId,
                    CustomerName: customerName,
                    OldBalance: dbBalance,
                    NewBalance: excelBalance,
                    Difference: excelBalance - dbBalance
                });
            }
        });

        // Generate a Markdown report for the updates
        const mdPath = path.resolve(__dirname, 'proposed_updates_report.md');
        let mdContent = `# Proposed Solde Updates\n\n`;
        mdContent += `Total Database Clients processed: ${updates.length}\n\n`;

        const changes = updates.filter(u => Math.abs(u.Difference) > 0.01);
        const unchanged = updates.filter(u => Math.abs(u.Difference) <= 0.01);

        mdContent += `## Clients with Balance Changes (${changes.length})\n`;
        mdContent += `| Customer ID | DB Name | Old Balance (DB) | New Balance (Excel) | Difference |\n`;
        mdContent += `|---|---|---|---|---|\n`;
        
        // Sort by largest difference
        changes.sort((a, b) => Math.abs(b.Difference) - Math.abs(a.Difference));
        
        changes.forEach(c => {
            mdContent += `| ${c.CustomerID} | ${c.CustomerName} | ${c.OldBalance} | ${c.NewBalance} | ${c.Difference.toFixed(2)} |\n`;
        });

        if (changes.length === 0) mdContent += `| No balance changes found! | | | | |\n`;

        mdContent += `\n## Clients with NO Balance Changes (${unchanged.length})\n`;
        mdContent += `These clients either had matching balances or their Excel Balance is exactly the DB Balance.\n\n`;
        mdContent += `| Customer ID | DB Name | Balance (No Change) |\n`;
        mdContent += `|---|---|---|\n`;
        unchanged.forEach(c => {
            mdContent += `| ${c.CustomerID} | ${c.CustomerName} | ${c.OldBalance} |\n`;
        });
        if (unchanged.length === 0) mdContent += `| None | | |\n`;

        fs.writeFileSync(mdPath, mdContent);
        
        // Create a JSON payload that we can easily consume in the actual update script
        const jsonPath = path.resolve(__dirname, 'proposed_updates.json');
        fs.writeFileSync(jsonPath, JSON.stringify(updates, null, 2));

        console.log(`Extracted proposed updates for ${updates.length} clients.`);
        console.log(`Found ${changes.length} clients with balance changes.`);
        console.log(`Markdown report saved to: ${mdPath}`);
        
    } catch (error) {
        console.error('Error extracting updates:', error.message);
    }
}

extractUpdates();

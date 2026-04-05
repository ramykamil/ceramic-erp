require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');
const db = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function findDuplicates() {
    try {
        const query = `
            SELECT p.ProductID, p.ProductName, p.ProductCode, 
                   c.CategoryName, b.BrandName
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            WHERE p.IsActive = true OR p.IsActive = '1'
        `;

        const result = await db.query(query);
        const products = result.rows || result;

        console.log(`Fetched ${products.length} products.\n`);

        // Helper functions
        const normalizeRec = (name) => name.replace(/\bREC\b/ig, '').replace(/\s+/g, '').toLowerCase();
        const normalizeSpace = (name) => name.replace(/\s+/g, '').toLowerCase();

        const byRecMap = new Map();
        const bySpaceMap = new Map();

        for (const p of products) {
            const name = p.productname || p.ProductName; // Handle both PG and SQLite case
            const id = p.productid || p.ProductID;
            const code = p.productcode || p.ProductCode;
            const cat = p.categoryname || p.CategoryName;
            const brand = p.brandname || p.BrandName;

            const normalizedP = { id, name, code, cat, brand };

            // Checking for REC duplicates
            const baseForRec = normalizeRec(name);
            if (!byRecMap.has(baseForRec)) byRecMap.set(baseForRec, []);
            byRecMap.get(baseForRec).push(normalizedP);

            // Checking for Space duplicates
            const baseForSpace = normalizeSpace(name);
            if (!bySpaceMap.has(baseForSpace)) bySpaceMap.set(baseForSpace, []);
            bySpaceMap.get(baseForSpace).push(normalizedP);
        }

        const fs = require('fs');
        let report = "# Detailed Product Duplicates Report\n\n";
        report += `Generated on: ${new Date().toLocaleString()}\n`;
        report += `Total products analyzed: ${products.length}\n\n`;

        report += "## 1. Duplicates Based on 'REC' Suffix\n";
        report += "These products are likely duplicates where one entry has 'REC' (Rectified) and the other does not.\n\n";

        let recGroupsCount = 0;
        const recFamilies = {};

        for (const [key, group] of byRecMap.entries()) {
            if (group.length > 1 && group.some(p => p.name.toUpperCase().includes('REC'))) {
                recGroupsCount++;
                const family = group[0].brand || group[0].cat || 'Unknown Family';
                if (!recFamilies[family]) recFamilies[family] = [];
                recFamilies[family].push(group);
            }
        }

        if (recGroupsCount === 0) {
            report += "No 'REC' duplicates found.\n";
        } else {
            for (const family in recFamilies) {
                report += `### Family: ${family}\n`;
                recFamilies[family].forEach(group => {
                    report += "| ID | Code | Product Name |\n";
                    report += "|---|---|---|\n";
                    group.forEach(p => {
                        report += `| ${p.id} | ${p.code} | ${p.name} |\n`;
                    });
                    report += "\n";
                });
            }
        }

        report += "\n---\n\n## 2. Duplicates Based on Missing Spaces\n";
        report += "These products are likely duplicates where the only difference is the spacing in the name.\n\n";

        let spaceGroupsCount = 0;
        const spaceFamilies = {};

        for (const [key, group] of bySpaceMap.entries()) {
            if (group.length > 1) {
                const spaceCounts = new Set(group.map(p => (p.name.match(/ /g) || []).length));
                if (spaceCounts.size > 1) {
                    spaceGroupsCount++;
                    const family = group[0].brand || group[0].cat || 'Unknown Family';
                    if (!spaceFamilies[family]) spaceFamilies[family] = [];
                    spaceFamilies[family].push(group);
                }
            }
        }

        if (spaceGroupsCount === 0) {
            report += "No spacing duplicates found.\n";
        } else {
            for (const family in spaceFamilies) {
                report += `### Family: ${family}\n`;
                spaceFamilies[family].forEach(group => {
                    report += "| ID | Code | Product Name |\n";
                    report += "|---|---|---|\n";
                    group.forEach(p => {
                        report += `| ${p.id} | ${p.code} | ${p.name} |\n`;
                    });
                    report += "\n";
                });
            }
        }

        const reportPath = __dirname + '/detailed_duplicates_report.md';
        fs.writeFileSync(reportPath, report);
        console.log(`\n✅ Markdown report generated at: ${reportPath}`);

        // Generate CSV version
        let csv = "Category/Family,Group Type,Product ID,Product Code,Product Name\n";

        // Add REC duplicates to CSV
        for (const family in recFamilies) {
            recFamilies[family].forEach(group => {
                group.forEach(p => {
                    csv += `"${family.replace(/"/g, '""')}","REC Duplicate","${p.id}","${p.code.replace(/"/g, '""')}","${p.name.replace(/"/g, '""')}"\n`;
                });
            });
        }

        // Add Spacing duplicates to CSV
        for (const family in spaceFamilies) {
            spaceFamilies[family].forEach(group => {
                group.forEach(p => {
                    csv += `"${family.replace(/"/g, '""')}","Spacing Variation","${p.id}","${p.code.replace(/"/g, '""')}","${p.name.replace(/"/g, '""')}"\n`;
                });
            });
        }

        const csvPath = __dirname + '/detailed_duplicates_report.csv';
        fs.writeFileSync(csvPath, csv);
        console.log(`✅ CSV report generated at: ${csvPath}`);

    } catch (err) {
        console.error("Error finding duplicates:", err);
    } finally {
        if (db.close) await db.close();
        process.exit(0);
    }
}

findDuplicates();

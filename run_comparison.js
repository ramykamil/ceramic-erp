const fs = require('fs');
const { Client } = require('pg');

const onlineDbUrl = 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7%27EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres';

async function runComparison() {
    console.log('Connecting to online database...');
    const excelData = JSON.parse(fs.readFileSync('excel_data_refined.json', 'utf8'));
    
    const client = new Client({ 
        connectionString: onlineDbUrl, 
        ssl: { rejectUnauthorized: false } 
    });
    
    try {
        await client.connect();
        console.log('Connected. Fetching products...');
        
        const res = await client.query('SELECT id, name, qte, qpc, cpp, "purchasePrice", "salePrice" FROM products');
        const dbProducts = res.rows;
        await client.end();

        console.log(`Found ${dbProducts.length} products in DB. Comparing...`);

        const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

        const report = {
            meta: { 
                totalExcel: excelData.length, 
                totalDb: dbProducts.length, 
                timestamp: new Date().toISOString() 
            },
            discrepancies: [],
            missingInDb: [],
            perfectMatches: 0
        };

        excelData.forEach(excel => {
            // Try matching by "Supplier - ProductName" or just "ProductName"
            const dbProduct = dbProducts.find(p => {
                const dbNorm = normalize(p.name);
                return dbNorm === normalize(excel.productName) || 
                       dbNorm === normalize(excel.fullName) ||
                       dbNorm.includes(normalize(excel.productName));
            });

            if (!dbProduct) {
                report.missingInDb.push(excel);
                return;
            }

            const diffs = {};
            // Quantity check
            if (Math.abs(excel.qte - (dbProduct.qte || 0)) > 0.1) {
                diffs.qte = { excel: excel.qte, db: dbProduct.qte };
            }
            // Price checks
            if (Math.abs(excel.purchasePrice - (dbProduct.purchasePrice || 0)) > 0.1) {
                diffs.purchasePrice = { excel: excel.purchasePrice, db: dbProduct.purchasePrice };
            }
            if (Math.abs(excel.salePrice - (dbProduct.salePrice || 0)) > 0.1) {
                diffs.salePrice = { excel: excel.salePrice, db: dbProduct.salePrice };
            }
            // Packaging check
            if (Math.abs(excel.qpc - (dbProduct.qpc || 0)) > 0.01) {
                diffs.qpc = { excel: excel.qpc, db: dbProduct.qpc };
            }

            if (Object.keys(diffs).length > 0) {
                report.discrepancies.push({
                    name: excel.productName,
                    supplier: excel.supplier,
                    dbId: dbProduct.id,
                    dbName: dbProduct.name,
                    diffs
                });
            } else {
                report.perfectMatches++;
            }
        });

        fs.writeFileSync('comparison_report_refined.json', JSON.stringify(report, null, 2));
        console.log('-----------------------------------------');
        console.log('REPORT SUMMARY');
        console.log('-----------------------------------------');
        console.log(`Perfect Matches: ${report.perfectMatches}`);
        console.log(`Discrepancies found: ${report.discrepancies.length}`);
        console.log(`Products in Excel missing from DB: ${report.missingInDb.length}`);
        console.log('Full report saved to: comparison_report_refined.json');

        // Show sample of specific product for verification
        const sample = report.discrepancies.find(d => d.name.includes('CONCRETE GRIS 45/45') && d.supplier.includes('TECHNO'));
        if (sample) {
            console.log('\nVerification (TECHNO CERAM - CONCRETE GRIS 45/45):');
            console.log(JSON.stringify(sample.diffs, null, 2));
        }

    } catch (err) {
        console.error('Error during comparison:', err);
    }
}

runComparison();

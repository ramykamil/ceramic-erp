require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log('--- Loading Excel File ---');
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        console.log(`Loaded ${rawData.length} rows from Excel.\n`);

        const client = await pool.connect();

        console.log('--- Loading Database Products and Inventory ---');
        // Fetch products along with their total inventory from all warehouses
        const dbQuery = `
      SELECT 
        p.ProductID, 
        p.ProductCode, 
        p.ProductName, 
        p.BasePrice, 
        p.PurchasePrice,
        COALESCE(SUM(i.QuantityOnHand), 0) as TotalQty,
        COALESCE(SUM(i.PalletCount), 0) as TotalPallets,
        COALESCE(SUM(i.ColisCount), 0) as TotalColis
      FROM Products p
      LEFT JOIN Inventory i ON p.ProductID = i.ProductID
      WHERE p.IsActive = true
      GROUP BY p.ProductID, p.ProductCode, p.ProductName, p.BasePrice, p.PurchasePrice
    `;
        const dbProductsResult = await client.query(dbQuery);
        const dbProducts = dbProductsResult.rows;
        console.log(`Loaded ${dbProducts.length} active products from Online Database.\n`);

        // Create maps for lookup
        const dbByCode = new Map();
        const dbByName = new Map();
        dbProducts.forEach(p => {
            if (p.productcode) dbByCode.set(p.productcode.trim().toUpperCase(), p);
            if (p.productname) dbByName.set(p.productname.trim().toUpperCase(), p);
        });

        const report = [];
        let noMatchCount = 0;
        let discrepancyCount = 0;
        let exactMatchCount = 0;

        for (const row of rawData) {
            const excelCode = row['Reference']?.toString().trim().toUpperCase() || '';
            const excelName = row['Libellé']?.toString().trim().toUpperCase() || '';
            const excelQty = parseFloat(row['Qté']) || 0;
            const excelPallets = parseFloat(row['NB PALETTE']) || 0;
            const excelColis = parseFloat(row['NB COLIS']) || 0;
            const excelBasePrice = parseFloat(row['Prix de vente']) || 0;
            const excelPurchasePrice = parseFloat(row["Prix d'achat"]) || 0;

            let dbProduct = dbByCode.get(excelCode);
            if (!dbProduct && excelName) {
                dbProduct = dbByName.get(excelName);
            }

            if (!dbProduct) {
                noMatchCount++;
                continue; // Or log it, but user wants to compare values of matched ones
            }

            const dbQty = parseFloat(dbProduct.totalqty);
            const dbPallets = parseFloat(dbProduct.totalpallets);
            const dbColis = parseFloat(dbProduct.totalcolis);
            const dbBasePrice = parseFloat(dbProduct.baseprice || 0);
            const dbPurchasePrice = parseFloat(dbProduct.purchaseprice || 0);

            const isQtyDiff = Math.abs(excelQty - dbQty) > 0.01;
            const isPalletsDiff = Math.abs(excelPallets - dbPallets) > 0.01;
            const isColisDiff = Math.abs(excelColis - dbColis) > 0.01;
            const isBasePriceDiff = Math.abs(excelBasePrice - dbBasePrice) > 0.01;
            const isPurchasePriceDiff = Math.abs(excelPurchasePrice - dbPurchasePrice) > 0.01;

            if (isQtyDiff || isPalletsDiff || isColisDiff || isBasePriceDiff || isPurchasePriceDiff) {
                discrepancyCount++;

                const diffs = [];
                if (isQtyDiff) diffs.push(`Qty: DB=${dbQty.toFixed(2)}, Excel=${excelQty.toFixed(2)}`);
                if (isPalletsDiff) diffs.push(`Pallets: DB=${dbPallets.toFixed(2)}, Excel=${excelPallets.toFixed(2)}`);
                if (isColisDiff) diffs.push(`Colis: DB=${dbColis.toFixed(2)}, Excel=${excelColis.toFixed(2)}`);
                if (isBasePriceDiff) diffs.push(`Sale Price: DB=${dbBasePrice.toFixed(2)}, Excel=${excelBasePrice.toFixed(2)}`);
                if (isPurchasePriceDiff) diffs.push(`Purchase Price: DB=${dbPurchasePrice.toFixed(2)}, Excel=${excelPurchasePrice.toFixed(2)}`);

                report.push({
                    Reference: excelCode,
                    Name: excelName,
                    Differences: diffs.join(' | ')
                });
            } else {
                exactMatchCount++;
            }
        }

        client.release();
        pool.end();

        console.log('--- Comparison Results ---');
        console.log(`Exact Matches (No discrepancies): ${exactMatchCount}`);
        console.log(`Discrepancies Found: ${discrepancyCount}`);
        console.log(`Products in Excel not in DB: ${noMatchCount}`);

        let reportText = "============== DISCREPANCY REPORT ==============\n\n";
        reportText += `Total Discrepancies: ${discrepancyCount}\n\n`;
        report.forEach((item, index) => {
            reportText += `${index + 1}. [${item.Reference}] ${item.Name}\n   -> Discrepancies: ${item.Differences}\n\n`;
        });

        const reportPath = path.resolve(__dirname, 'discrepancy_report.txt');
        fs.writeFileSync(reportPath, reportText);
        console.log(`\nFull report saved to: ${reportPath}`);

    } catch (err) {
        console.error('Error:', err);
    }
}

main();

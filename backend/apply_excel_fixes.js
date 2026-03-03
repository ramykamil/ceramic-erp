require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function applyExcelFixes() {
    const client = await pool.connect();

    try {
        console.log('--- Loading Excel File ---');
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        console.log(`Loaded ${rawData.length} rows from Excel.\n`);

        console.log('--- Loading Database Products and Inventory ---');
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

        const dbByCode = new Map();
        const dbByName = new Map();
        dbProducts.forEach(p => {
            if (p.productcode) dbByCode.set(p.productcode.trim().toUpperCase(), p);
            if (p.productname) dbByName.set(p.productname.trim().toUpperCase(), p);
        });

        await client.query('BEGIN');
        console.log('--- Applying Fixes ---');

        let fixedCount = 0;
        const reportData = [];

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

            if (!dbProduct) continue; // Only process exact matches

            const dbQty = parseFloat(dbProduct.totalqty);
            const dbPallets = parseFloat(dbProduct.totalpallets);
            const dbColis = parseFloat(dbProduct.totalcolis);
            const dbBasePrice = parseFloat(dbProduct.baseprice || 0);
            const dbPurchasePrice = parseFloat(dbProduct.purchaseprice || 0);

            const isDiff =
                Math.abs(excelQty - dbQty) > 0.001 ||
                Math.abs(excelPallets - dbPallets) > 0.001 ||
                Math.abs(excelColis - dbColis) > 0.001 ||
                Math.abs(excelBasePrice - dbBasePrice) > 0.001 ||
                Math.abs(excelPurchasePrice - dbPurchasePrice) > 0.001;

            if (isDiff) {
                const pId = dbProduct.productid;
                console.log(`\nFixing [${pId}] ${dbProduct.productname}`);
                console.log(`  Expected Qty: ${excelQty} (was ${dbQty})`);

                // Update Prices
                await client.query(
                    `UPDATE Products SET BasePrice = $1, PurchasePrice = $2 WHERE ProductID = $3`,
                    [excelBasePrice, excelPurchasePrice, pId]
                );

                // Manage Inventory
                // Fetch all inventory records for this product
                const invResult = await client.query(`SELECT InventoryID FROM Inventory WHERE ProductID = $1`, [pId]);
                const inventoryIDs = invResult.rows.map(r => r.inventoryid);

                if (inventoryIDs.length > 0) {
                    // Keep the first one, delete the rest if any duplicates
                    const primaryInvID = inventoryIDs[0];
                    const duplicateIDs = inventoryIDs.slice(1);

                    if (duplicateIDs.length > 0) {
                        console.log(`  Deleting ${duplicateIDs.length} duplicate inventory records...`);
                        // For safety we only delete duplicates if they belong to the exact product
                        await client.query(`DELETE FROM Inventory WHERE InventoryID = ANY($1)`, [duplicateIDs]);
                    }

                    // Update primary inventory directly to excel values
                    await client.query(
                        `UPDATE Inventory 
                 SET QuantityOnHand = $1, PalletCount = $2, ColisCount = $3 
                 WHERE InventoryID = $4`,
                        [excelQty, excelPallets, excelColis, primaryInvID]
                    );
                } else {
                    // Edge case: Product has no primary inventory. Insert one assuming warehouse 1.
                    console.log(`  No inventory record found, inserting...`);
                    await client.query(
                        `INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount) 
                 VALUES ($1, 1, 'OWNED', $2, $3, $4)`,
                        [pId, excelQty, excelPallets, excelColis]
                    );
                }

                fixedCount++;
                reportData.push(`"${pId}","${excelCode}","${excelName}","${dbQty} -> ${excelQty}","${dbPallets} -> ${excelPallets}","${dbColis} -> ${excelColis}","${dbBasePrice} -> ${excelBasePrice}","${dbPurchasePrice} -> ${excelPurchasePrice}"`);
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ COMMITTED — Successfully applied fixes to ${fixedCount} products.\n`);

        console.log('--- Refreshing mv_Catalogue ---');
        await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed.\n');

        const reportCSVPath = path.resolve(__dirname, 'excel_fixes_report.csv');
        const header = '"Product ID","Code","Name","Quantity Fix","Pallets Fix","Colis Fix","Base Price Fix","Purchase Price Fix"\n';
        fs.writeFileSync(reportCSVPath, header + reportData.join('\n'));
        console.log(`✅ CSV Fix report saved to: ${reportCSVPath}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR applying fixes — rolled back:', err.message, err.stack);
    } finally {
        client.release();
        pool.end();
    }
}

applyExcelFixes();

require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Helper function to normalize strings for matching
const normalize = (str) => {
    if (!str) return '';
    return str.toString()
        .toLowerCase()
        .replace(/\s+/g, '')
        .trim();
};

async function importMissingProducts() {
    const client = await pool.connect();
    const isDryRun = process.env.DRY_RUN === 'true';

    try {
        console.log('--- Loading Excel File ---');
        const filePath = 'c:/Users/Ramy Kamil Mecheri/Desktop/ceramic-erp-main/ceramic-erp-main/missing_products.xlsx';
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        console.log(`Loaded ${rawData.length} rows from Excel.\n`);

        console.log('--- Loading Database Products ---');
        const dbQuery = `SELECT ProductID, ProductCode, ProductName FROM Products`;
        const dbProductsResult = await client.query(dbQuery);
        const dbProducts = dbProductsResult.rows;
        console.log(`Loaded ${dbProducts.length} total products from Online Database.\n`);

        const brandsQuery = `SELECT BrandID, BrandName FROM Brands`;
        const brandsResult = await client.query(brandsQuery);
        const dbBrands = brandsResult.rows;
        const brandMap = new Map();
        dbBrands.forEach(b => {
            if (b.brandname) brandMap.set(b.brandname.trim().toUpperCase(), b.brandid);
        });

        const dbByCode = new Map();
        const dbByName = new Map();
        const dbByCodeNorm = new Map();
        const dbByNameNorm = new Map();

        dbProducts.forEach(p => {
            if (p.productcode) {
                dbByCode.set(p.productcode.trim().toUpperCase(), p);
                dbByCodeNorm.set(normalize(p.productcode), p);
            }
            if (p.productname) {
                dbByName.set(p.productname.trim().toUpperCase(), p);
                dbByNameNorm.set(normalize(p.productname), p);
            }
        });

        await client.query('BEGIN');
        if (isDryRun) {
            console.log('🚀 DRY RUN MODE ENABLED - No changes will be committed.\n');
        }

        console.log('--- Scanning for Missing Products ---');

        let importedCount = 0;
        let skippedCount = 0;
        let fallbackBrandId = 1;
        if (dbBrands.length > 0) fallbackBrandId = dbBrands[0].brandid;

        const catQuery = await client.query('SELECT CategoryID FROM Categories LIMIT 1');
        let fallbackCategoryId = catQuery.rows.length > 0 ? catQuery.rows[0].categoryid : 1;

        for (const row of rawData) {
            const excelFamily = row['Famille']?.toString().trim().toUpperCase() || '';
            const excelCode = row['Reference']?.toString().trim() || '';
            const excelName = row['Libellé']?.toString().trim() || '';
            const excelQty = parseFloat(row['Qté']) || 0;
            const excelPallets = parseFloat(row['NB PALETTE']) || 0;
            const excelColis = parseFloat(row['NB COLIS']) || 0;
            const excelBasePrice = parseFloat(row['Prix de vente']) || 0;
            const excelPurchasePrice = parseFloat(row["Prix d'achat"]) || 0;
            
            // Extract packaging info (flexible column names)
            const excelQpc = parseFloat(row['QteParColis'] || row['QPC']) || 0;
            const excelCpp = parseFloat(row['QteColisParPalette'] || row['CPP']) || 0;

            const upperExcCode = excelCode.toUpperCase();
            const upperExcName = excelName.toUpperCase();
            const normExcCode = normalize(excelCode);
            const normExcName = normalize(excelName);

            // Force upload as requested by user, bypassing duplicate check
            const dbProduct = null;
            /*
            let dbProduct = dbByCode.get(upperExcCode);
            if (!dbProduct && excelName) {
                dbProduct = dbByName.get(upperExcName);
            }

            if (!dbProduct) {
                dbProduct = dbByCodeNorm.get(normExcCode) || dbByNameNorm.get(normExcName);
            }
            */

            if (!dbProduct) {
                if (isDryRun) {
                    console.log(`[DRY RUN] Will insert: [${excelCode}] ${excelName} (${excelFamily})`);
                    importedCount++;
                    continue;
                }

                let brandId = fallbackBrandId;
                if (excelFamily && brandMap.has(excelFamily)) {
                    brandId = brandMap.get(excelFamily);
                } else if (excelFamily) {
                    const insertBrandRes = await client.query(
                        `INSERT INTO Brands (BrandName, IsActive) VALUES ($1, true) RETURNING BrandID`,
                        [excelFamily]
                    );
                    brandId = insertBrandRes.rows[0].brandid;
                    brandMap.set(excelFamily, brandId);
                }

                console.log(`Inserting [${excelCode}] ${excelName}`);

                let finalCode = excelCode;
                let insertSuccess = false;
                let newProductId = null;
                let attempt = 0;

                while (!insertSuccess && attempt < 5) {
                    try {
                        await client.query('SAVEPOINT insert_product');
                        const insertProductRes = await client.query(
                            `INSERT INTO Products (
                                ProductCode, ProductName, CategoryID, BrandID, 
                                BasePrice, PurchasePrice, IsActive,
                                QteParColis, QteColisParPalette
                            ) 
                            VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8) 
                            RETURNING ProductID`,
                            [
                                finalCode, excelName, fallbackCategoryId, brandId,
                                excelBasePrice, excelPurchasePrice, excelQpc, excelCpp
                            ]
                        );
                        await client.query('RELEASE SAVEPOINT insert_product');
                        newProductId = insertProductRes.rows[0].productid;
                        insertSuccess = true;
                    } catch (err) {
                        await client.query('ROLLBACK TO SAVEPOINT insert_product');
                        if (err.code === '23505') { 
                            attempt++;
                            const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
                            finalCode = `${excelCode}_NEW_${randomSuffix}`;
                            console.log(`  Code conflict. Retrying with Code: ${finalCode}`);
                        } else {
                            throw err;
                        }
                    }
                }

                if (!insertSuccess) throw new Error(`Failed to insert product: ${excelCode}`);

                await client.query(
                    `INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount) 
                     VALUES ($1, 1, 'OWNED', $2, $3, $4)`,
                    [newProductId, excelQty, excelPallets, excelColis]
                );

                importedCount++;
            } else {
                if (isDryRun && skippedCount < 10) {
                    console.log(`[DRY RUN] Skipping - already exists: "${excelName}" matches DB: "${dbProduct.productname}" (Code: ${dbProduct.productcode})`);
                }
                skippedCount++;
            }
        }

        if (isDryRun) {
            console.log(`\n🔍 DRY RUN FINISHED — Found ${importedCount} missing products and ${skippedCount} existing products.\n`);
            await client.query('ROLLBACK');
        } else {
            await client.query('COMMIT');
            console.log(`\n✅ COMMITTED — Successfully imported ${importedCount} missing products and ${skippedCount} items were skipped.\n`);
            console.log('--- Refreshing mv_Catalogue ---');
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('✅ mv_Catalogue refreshed.\n');
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR applying imports — rolled back:', err.message);
    } finally {
        client.release();
        pool.end();
    }
}

importMissingProducts();

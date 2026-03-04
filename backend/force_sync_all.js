require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const normalize = (str) => {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/\s+/g, '').trim();
};

async function forceSync() {
    const client = await pool.connect();
    try {
        console.log('--- Loading Excel File ---');
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
        console.log(`Loaded ${rawData.length} rows from Excel.\n`);

        console.log('--- Loading ALL Database Products ---');
        // Load ALL products (active and inactive)
        const dbQuery = `SELECT ProductID, ProductCode, ProductName FROM Products`;
        const dbProductsResult = await client.query(dbQuery);
        const dbProducts = dbProductsResult.rows;

        const dbByCode = new Map();
        const dbByName = new Map();
        const dbByCodeNorm = new Map();
        const dbByNameNorm = new Map();

        // Sort so we prioritize active/older products if duplicates exist
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
        console.log('--- Force Syncing 1501 Products ---');

        let syncedCount = 0;
        let missingCount = 0;

        for (const row of rawData) {
            const excelCode = row['Reference']?.toString().trim() || '';
            const excelName = row['Libellé']?.toString().trim() || '';
            const excelQty = parseFloat(row['Qté']) || 0;
            const excelPallets = parseFloat(row['NB PALETTE']) || 0;
            const excelColis = parseFloat(row['NB COLIS']) || 0;
            const excelBasePrice = parseFloat(row['Prix de vente']) || 0;
            const excelPurchasePrice = parseFloat(row["Prix d'achat"]) || 0;

            const upperExcCode = excelCode.toUpperCase();
            const upperExcName = excelName.toUpperCase();
            const normExcCode = normalize(excelCode);
            const normExcName = normalize(excelName);

            let dbProduct = dbByName.get(upperExcName);
            if (!dbProduct && excelCode) dbProduct = dbByCode.get(upperExcCode);
            if (!dbProduct) dbProduct = dbByNameNorm.get(normExcName) || dbByCodeNorm.get(normExcCode);

            if (!dbProduct) {
                missingCount++;
                console.log(`Still Missing: [${excelCode}] ${excelName}`);
                continue;
            }

            const pId = dbProduct.productid;

            // 1. Force Active & Update Prices
            await client.query(
                `UPDATE Products SET IsActive = true, BasePrice = $1, PurchasePrice = $2 WHERE ProductID = $3`,
                [excelBasePrice, excelPurchasePrice, pId]
            );

            // 2. Clear out existing inventory
            await client.query(`DELETE FROM Inventory WHERE ProductID = $1`, [pId]);

            // 3. Insert EXACT inventory
            await client.query(
                `INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount) 
                 VALUES ($1, 1, 'OWNED', $2, $3, $4)`,
                [pId, excelQty, excelPallets, excelColis]
            );

            syncedCount++;
        }

        await client.query('COMMIT');
        console.log(`\n✅ COMMITTED — Force synced ${syncedCount} products.`);
        console.log(`⚠️ Missing / Un-syncable: ${missingCount}`);

        console.log('\n--- Refreshing mv_Catalogue ---');
        await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed.\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR — rolled back:', err);
    } finally {
        client.release();
        pool.end();
    }
}
forceSync();

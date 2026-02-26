require('dotenv').config();
const { Pool } = require('pg');

// Local DB
const localPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Cloud DB
const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function fullCompare() {
    try {
        // ============================================================
        // PART 1: PRODUCTS — Names, Prices, Metadata
        // ============================================================
        console.log('========================================');
        console.log('  PART 1: PRODUCTS COMPARISON');
        console.log('========================================\n');

        const localProducts = await localPool.query(`
      SELECT ProductID, ProductCode, ProductName, BrandID, IsActive,
             BasePrice, PurchasePrice, Calibre, Choix, QteParColis, QteColisParPalette, Size
      FROM Products ORDER BY ProductID
    `);
        const cloudProducts = await cloudPool.query(`
      SELECT ProductID, ProductCode, ProductName, BrandID, IsActive,
             BasePrice, PurchasePrice, Calibre, Choix, QteParColis, QteColisParPalette, Size
      FROM Products ORDER BY ProductID
    `);

        const localMap = new Map();
        localProducts.rows.forEach(r => localMap.set(r.productid, r));
        const cloudMap = new Map();
        cloudProducts.rows.forEach(r => cloudMap.set(r.productid, r));

        const missingOnCloud = [];
        const nameChanged = [];
        const priceChanged = [];
        const metadataChanged = [];
        const activeStatusDiff = [];
        const missingOnLocal = [];

        for (const [id, lp] of localMap) {
            const cp = cloudMap.get(id);
            if (!cp) {
                missingOnCloud.push(lp);
            } else {
                if (lp.productname !== cp.productname) {
                    nameChanged.push({ id, local: lp.productname, cloud: cp.productname });
                }
                const lPrice = parseFloat(lp.baseprice || 0);
                const cPrice = parseFloat(cp.baseprice || 0);
                const lPurchase = parseFloat(lp.purchaseprice || 0);
                const cPurchase = parseFloat(cp.purchaseprice || 0);
                if (Math.abs(lPrice - cPrice) > 0.01 || Math.abs(lPurchase - cPurchase) > 0.01) {
                    priceChanged.push({ id, name: lp.productname, localSale: lPrice, cloudSale: cPrice, localPurchase: lPurchase, cloudPurchase: cPurchase });
                }
                if (lp.isactive !== cp.isactive) {
                    activeStatusDiff.push({ id, name: lp.productname, localActive: lp.isactive, cloudActive: cp.isactive });
                }
                // Check brand, calibre, choix, packaging
                if (lp.brandid !== cp.brandid || lp.calibre !== cp.calibre || lp.choix !== cp.choix ||
                    parseFloat(lp.qteparcolis || 0) !== parseFloat(cp.qteparcolis || 0) ||
                    parseFloat(lp.qtecolisparpalette || 0) !== parseFloat(cp.qtecolisparpalette || 0)) {
                    metadataChanged.push({
                        id, name: lp.productname,
                        localBrand: lp.brandid, cloudBrand: cp.brandid,
                        localCalibre: lp.calibre, cloudCalibre: cp.calibre,
                        localChoix: lp.choix, cloudChoix: cp.choix,
                        localQPC: parseFloat(lp.qteparcolis || 0), cloudQPC: parseFloat(cp.qteparcolis || 0),
                        localQCP: parseFloat(lp.qtecolisparpalette || 0), cloudQCP: parseFloat(cp.qtecolisparpalette || 0),
                    });
                }
            }
        }

        for (const [id, cp] of cloudMap) {
            if (!localMap.has(id)) {
                missingOnLocal.push(cp);
            }
        }

        console.log(`Local active: ${localProducts.rows.filter(r => r.isactive).length} | Cloud active: ${cloudProducts.rows.filter(r => r.isactive).length}`);
        console.log(`Local total:  ${localProducts.rows.length} | Cloud total:  ${cloudProducts.rows.length}\n`);

        console.log(`--- MISSING ON CLOUD (${missingOnCloud.length}) ---`);
        missingOnCloud.forEach(p => console.log(`  [${p.productid}] ${p.productname} (Active: ${p.isactive})`));

        console.log(`\n--- NAME MISMATCHES (${nameChanged.length}) ---`);
        nameChanged.forEach(p => console.log(`  [${p.id}] LOCAL: "${p.local}" → CLOUD: "${p.cloud}"`));

        console.log(`\n--- PRICE DIFFERENCES (${priceChanged.length}) ---`);
        if (priceChanged.length <= 30) {
            priceChanged.forEach(p => console.log(`  [${p.id}] ${p.name} | Sale: ${p.localSale}→${p.cloudSale} | Purchase: ${p.localPurchase}→${p.cloudPurchase}`));
        } else {
            console.log(`  (Showing first 30 of ${priceChanged.length})`);
            priceChanged.slice(0, 30).forEach(p => console.log(`  [${p.id}] ${p.name} | Sale: ${p.localSale}→${p.cloudSale} | Purchase: ${p.localPurchase}→${p.cloudPurchase}`));
        }

        console.log(`\n--- ACTIVE STATUS DIFFERENCES (${activeStatusDiff.length}) ---`);
        activeStatusDiff.forEach(p => console.log(`  [${p.id}] ${p.name} | Local: ${p.localActive} | Cloud: ${p.cloudActive}`));

        console.log(`\n--- METADATA DIFFERENCES (brand/calibre/choix/packaging) (${metadataChanged.length}) ---`);
        if (metadataChanged.length <= 30) {
            metadataChanged.forEach(p => {
                const diffs = [];
                if (p.localBrand !== p.cloudBrand) diffs.push(`Brand: ${p.localBrand}→${p.cloudBrand}`);
                if (p.localCalibre !== p.cloudCalibre) diffs.push(`Calibre: ${p.localCalibre}→${p.cloudCalibre}`);
                if (p.localChoix !== p.cloudChoix) diffs.push(`Choix: ${p.localChoix}→${p.cloudChoix}`);
                if (p.localQPC !== p.cloudQPC) diffs.push(`QPC: ${p.localQPC}→${p.cloudQPC}`);
                if (p.localQCP !== p.cloudQCP) diffs.push(`QCP: ${p.localQCP}→${p.cloudQCP}`);
                console.log(`  [${p.id}] ${p.name} | ${diffs.join(' | ')}`);
            });
        } else {
            console.log(`  (Showing first 30 of ${metadataChanged.length})`);
            metadataChanged.slice(0, 30).forEach(p => {
                const diffs = [];
                if (p.localBrand !== p.cloudBrand) diffs.push(`Brand: ${p.localBrand}→${p.cloudBrand}`);
                if (p.localCalibre !== p.cloudCalibre) diffs.push(`Calibre: ${p.localCalibre}→${p.cloudCalibre}`);
                if (p.localChoix !== p.cloudChoix) diffs.push(`Choix: ${p.localChoix}→${p.cloudChoix}`);
                if (p.localQPC !== p.cloudQPC) diffs.push(`QPC: ${p.localQPC}→${p.cloudQPC}`);
                if (p.localQCP !== p.cloudQCP) diffs.push(`QCP: ${p.localQCP}→${p.cloudQCP}`);
                console.log(`  [${p.id}] ${p.name} | ${diffs.join(' | ')}`);
            });
        }

        console.log(`\n--- ONLY ON CLOUD / NOT IN LOCAL (${missingOnLocal.length}) ---`);
        missingOnLocal.forEach(p => console.log(`  [${p.productid}] ${p.productname} (Active: ${p.isactive})`));

        // ============================================================
        // PART 2: INVENTORY COMPARISON
        // ============================================================
        console.log('\n\n========================================');
        console.log('  PART 2: INVENTORY COMPARISON');
        console.log('========================================\n');

        const localInv = await localPool.query(`
      SELECT i.ProductID, p.ProductName, i.WarehouseID, i.OwnershipType,
             i.QuantityOnHand, i.PalletCount, i.ColisCount
      FROM Inventory i
      JOIN Products p ON i.ProductID = p.ProductID
      WHERE p.IsActive = true
      ORDER BY i.ProductID
    `);
        const cloudInv = await cloudPool.query(`
      SELECT i.ProductID, p.ProductName, i.WarehouseID, i.OwnershipType,
             i.QuantityOnHand, i.PalletCount, i.ColisCount
      FROM Inventory i
      JOIN Products p ON i.ProductID = p.ProductID
      WHERE p.IsActive = true
      ORDER BY i.ProductID
    `);

        // Build inventory maps keyed by "ProductID-WarehouseID-OwnershipType"
        const localInvMap = new Map();
        localInv.rows.forEach(r => {
            const key = `${r.productid}-${r.warehouseid}-${r.ownershiptype}`;
            localInvMap.set(key, r);
        });
        const cloudInvMap = new Map();
        cloudInv.rows.forEach(r => {
            const key = `${r.productid}-${r.warehouseid}-${r.ownershiptype}`;
            cloudInvMap.set(key, r);
        });

        const invMissingOnCloud = [];
        for (const [key, li] of localInvMap) {
            if (!cloudInvMap.has(key)) {
                invMissingOnCloud.push(li);
            }
        }

        console.log(`Local inventory records: ${localInv.rows.length} | Cloud: ${cloudInv.rows.length}`);
        console.log(`\n--- INVENTORY RECORDS MISSING ON CLOUD (${invMissingOnCloud.length}) ---`);
        invMissingOnCloud.forEach(r => console.log(`  [${r.productid}] ${r.productname} | WH:${r.warehouseid} | ${r.ownershiptype} | Qty:${r.quantityonhand}`));

        // ============================================================
        // PART 3: BRANDS COMPARISON
        // ============================================================
        console.log('\n\n========================================');
        console.log('  PART 3: BRANDS COMPARISON');
        console.log('========================================\n');

        const localBrands = await localPool.query(`SELECT BrandID, BrandName, IsActive FROM Brands ORDER BY BrandID`);
        const cloudBrands = await cloudPool.query(`SELECT BrandID, BrandName, IsActive FROM Brands ORDER BY BrandID`);

        const localBrandMap = new Map();
        localBrands.rows.forEach(r => localBrandMap.set(r.brandid, r));
        const cloudBrandMap = new Map();
        cloudBrands.rows.forEach(r => cloudBrandMap.set(r.brandid, r));

        const brandsMissingCloud = [];
        const brandsNameDiff = [];
        for (const [id, lb] of localBrandMap) {
            const cb = cloudBrandMap.get(id);
            if (!cb) brandsMissingCloud.push(lb);
            else if (lb.brandname !== cb.brandname) brandsNameDiff.push({ id, local: lb.brandname, cloud: cb.brandname });
        }

        console.log(`Local brands: ${localBrands.rows.length} | Cloud: ${cloudBrands.rows.length}`);
        console.log(`\n--- BRANDS MISSING ON CLOUD (${brandsMissingCloud.length}) ---`);
        brandsMissingCloud.forEach(b => console.log(`  [${b.brandid}] ${b.brandname}`));
        console.log(`\n--- BRAND NAME MISMATCHES (${brandsNameDiff.length}) ---`);
        brandsNameDiff.forEach(b => console.log(`  [${b.id}] LOCAL: "${b.local}" → CLOUD: "${b.cloud}"`));

        // ============================================================
        // SUMMARY
        // ============================================================
        console.log('\n\n========================================');
        console.log('  SUMMARY');
        console.log('========================================');
        console.log(`Products missing on cloud:     ${missingOnCloud.length}`);
        console.log(`Product name mismatches:       ${nameChanged.length}`);
        console.log(`Product price differences:     ${priceChanged.length}`);
        console.log(`Active status differences:     ${activeStatusDiff.length}`);
        console.log(`Metadata differences:          ${metadataChanged.length}`);
        console.log(`Products only on cloud:        ${missingOnLocal.length}`);
        console.log(`Inventory missing on cloud:    ${invMissingOnCloud.length}`);
        console.log(`Brands missing on cloud:       ${brandsMissingCloud.length}`);
        console.log(`Brand name mismatches:         ${brandsNameDiff.length}`);

    } catch (err) {
        console.error('Error:', err.message, err.stack);
    } finally {
        localPool.end();
        cloudPool.end();
    }
}

fullCompare();

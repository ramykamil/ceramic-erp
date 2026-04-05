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

async function syncAll() {
    const client = await cloudPool.connect();
    let fixedNames = 0, fixedPrices = 0, fixedActive = 0, fixedMetadata = 0, fixedInventory = 0;

    try {
        await client.query('BEGIN');

        // ====== Fetch all local products ======
        const localProducts = await localPool.query(`
      SELECT ProductID, ProductCode, ProductName, BrandID, IsActive,
             BasePrice, PurchasePrice, Calibre, Choix, QteParColis, QteColisParPalette, Size,
             PrimaryUnitID, CategoryID, Description, FactoryID
      FROM Products ORDER BY ProductID
    `);
        const cloudProducts = await client.query(`
      SELECT ProductID, ProductCode, ProductName, BrandID, IsActive,
             BasePrice, PurchasePrice, Calibre, Choix, QteParColis, QteColisParPalette, Size
      FROM Products ORDER BY ProductID
    `);

        const cloudMap = new Map();
        cloudProducts.rows.forEach(r => cloudMap.set(r.productid, r));

        for (const lp of localProducts.rows) {
            const cp = cloudMap.get(lp.productid);

            if (!cp) {
                // Product exists locally but not on cloud at all — shouldn't happen per comparison, but handle it
                console.log(`  INSERT [${lp.productid}] ${lp.productname}`);
                await client.query(`
          INSERT INTO Products (ProductID, ProductCode, ProductName, CategoryID, BrandID, PrimaryUnitID, Description, BasePrice, PurchasePrice, FactoryID, Size, Calibre, Choix, QteParColis, QteColisParPalette, IsActive)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT (ProductID) DO NOTHING
        `, [lp.productid, lp.productcode, lp.productname, lp.categoryid, lp.brandid,
                lp.primaryunitid, lp.description, lp.baseprice, lp.purchaseprice, lp.factoryid,
                lp.size, lp.calibre, lp.choix, lp.qteparcolis, lp.qtecolisparpalette, lp.isactive]);
                continue;
            }

            // Build update fields dynamically
            const updates = [];
            const params = [];
            let pi = 1;

            // Name mismatch
            if (lp.productname !== cp.productname) {
                updates.push(`ProductName = $${pi}, ProductCode = $${pi + 1}`);
                params.push(lp.productname, lp.productcode);
                pi += 2;
                fixedNames++;
            }

            // Active status
            if (lp.isactive !== cp.isactive) {
                updates.push(`IsActive = $${pi}`);
                params.push(lp.isactive);
                pi++;
                fixedActive++;
            }

            // Prices
            const lSale = parseFloat(lp.baseprice || 0);
            const cSale = parseFloat(cp.baseprice || 0);
            const lPurchase = parseFloat(lp.purchaseprice || 0);
            const cPurchase = parseFloat(cp.purchaseprice || 0);
            if (Math.abs(lSale - cSale) > 0.01 || Math.abs(lPurchase - cPurchase) > 0.01) {
                updates.push(`BasePrice = $${pi}, PurchasePrice = $${pi + 1}`);
                params.push(lp.baseprice, lp.purchaseprice);
                pi += 2;
                fixedPrices++;
            }

            // SKIPPED: Metadata sync (brand/calibre/choix/packaging) — not needed per user request

            if (updates.length > 0) {
                params.push(lp.productid);
                const sql = `UPDATE Products SET ${updates.join(', ')}, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $${pi}`;
                await client.query(sql, params);
            }
        }

        console.log(`\n✅ Products synced: ${fixedNames} names, ${fixedActive} active status, ${fixedPrices} prices, ${fixedMetadata} metadata`);

        // ====== Fix missing inventory records ======
        console.log('\n--- Syncing missing inventory records ---');
        const localInv = await localPool.query(`
      SELECT i.ProductID, i.WarehouseID, i.OwnershipType, i.QuantityOnHand, i.QuantityReserved, i.PalletCount, i.ColisCount, i.FactoryID
      FROM Inventory i
      JOIN Products p ON i.ProductID = p.ProductID
      WHERE p.IsActive = true
    `);
        const cloudInv = await client.query(`
      SELECT ProductID, WarehouseID, OwnershipType FROM Inventory
    `);

        const cloudInvSet = new Set();
        cloudInv.rows.forEach(r => cloudInvSet.add(`${r.productid}-${r.warehouseid}-${r.ownershiptype}`));

        for (const li of localInv.rows) {
            const key = `${li.productid}-${li.warehouseid}-${li.ownershiptype}`;
            if (!cloudInvSet.has(key)) {
                console.log(`  INSERT inv [${li.productid}] WH:${li.warehouseid} | ${li.ownershiptype} | Qty:${li.quantityonhand}`);
                await client.query(`
          INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, QuantityReserved, PalletCount, ColisCount, FactoryID)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [li.productid, li.warehouseid, li.ownershiptype, li.quantityonhand, li.quantityreserved || 0, li.palletcount, li.coliscount, li.factoryid || null]);
                fixedInventory++;
            }
        }
        console.log(`✅ Inventory synced: ${fixedInventory} records added`);

        await client.query('COMMIT');

        // ====== Refresh materialized view ======
        console.log('\n--- Refreshing mv_Catalogue on cloud ---');
        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        // ====== VERIFICATION ======
        console.log('\n========================================');
        console.log('  VERIFICATION');
        console.log('========================================');

        // Check ALMERIA GRIS specifically
        const almeria = await cloudPool.query(`SELECT ProductID, ProductName FROM mv_Catalogue WHERE ProductName ILIKE '%ALMERIA GRIS%'`);
        console.log(`\nALMERIA GRIS on cloud: ${almeria.rows.length > 0 ? '✅ FOUND' : '❌ MISSING'}`);
        almeria.rows.forEach(r => console.log(`  [${r.productid}] ${r.productname}`));

        // Check previously deactivated products
        const reactivated = await cloudPool.query(`SELECT ProductID, ProductName, IsActive FROM Products WHERE ProductID IN (22, 314, 3175, 3638, 3864)`);
        console.log('\nReactivated products:');
        reactivated.rows.forEach(r => console.log(`  [${r.productid}] ${r.productname} (Active: ${r.isactive})`));

        // Final counts
        const finalCount = await cloudPool.query(`SELECT COUNT(*) FROM mv_Catalogue`);
        console.log(`\nFinal mv_Catalogue count: ${finalCount.rows[0].count}`);

        console.log('\n\n✅✅✅ ALL SYNC COMPLETE! ✅✅✅');
        console.log(`\nSummary:`);
        console.log(`  Names fixed:       ${fixedNames}`);
        console.log(`  Active fixed:      ${fixedActive}`);
        console.log(`  Prices fixed:      ${fixedPrices}`);
        console.log(`  Metadata fixed:    ${fixedMetadata}`);
        console.log(`  Inventory added:   ${fixedInventory}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR — rolled back:', err.message, err.stack);
    } finally {
        client.release();
        localPool.end();
        cloudPool.end();
    }
}

syncAll();

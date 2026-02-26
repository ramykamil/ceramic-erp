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

async function syncToCloud() {
    try {
        // ====== STEP 1: Fix name mismatches ======
        console.log('=== STEP 1: Fixing product name mismatches on cloud ===');
        const nameFixes = [
            { id: 3373, correctName: 'ALMERIA GRIS REC 60/60' },
            { id: 3460, correctName: 'FICHE:ALMERIA GRIS REC 60/60' },
            { id: 3692, correctName: 'FICHE:KING CREMA 45/90' },
            { id: 3771, correctName: 'FICHE:KING IVORY 45/90' },
            { id: 3860, correctName: 'MOTIF KING CREMA LUXE 45/90' },
        ];

        for (const fix of nameFixes) {
            const current = await cloudPool.query('SELECT ProductName, ProductCode FROM Products WHERE ProductID = $1', [fix.id]);
            if (current.rows.length > 0) {
                console.log(`  [${fix.id}] "${current.rows[0].productname}" → "${fix.correctName}"`);
                await cloudPool.query(
                    'UPDATE Products SET ProductName = $1, ProductCode = $1 WHERE ProductID = $2',
                    [fix.correctName, fix.id]
                );
                console.log(`    ✅ Updated`);
            }
        }

        // ====== STEP 2: Insert missing products ======
        console.log('\n=== STEP 2: Inserting products missing from cloud ===');
        const missingIds = [22, 314, 3175, 3638, 3864];

        for (const id of missingIds) {
            const localProduct = await localPool.query(
                'SELECT * FROM Products WHERE ProductID = $1', [id]
            );
            if (localProduct.rows.length === 0) {
                console.log(`  [${id}] Not found locally, skipping`);
                continue;
            }
            const p = localProduct.rows[0];

            // Check if it already exists on cloud (maybe inactive)
            const cloudCheck = await cloudPool.query('SELECT ProductID, IsActive FROM Products WHERE ProductID = $1', [id]);
            if (cloudCheck.rows.length > 0) {
                console.log(`  [${id}] ${p.productname} - Already exists on cloud (active: ${cloudCheck.rows[0].isactive}), reactivating...`);
                await cloudPool.query('UPDATE Products SET IsActive = true, ProductName = $1, ProductCode = $2 WHERE ProductID = $3',
                    [p.productname, p.productcode, id]);
            } else {
                console.log(`  [${id}] ${p.productname} - Inserting into cloud...`);
                await cloudPool.query(`
          INSERT INTO Products (ProductID, ProductCode, ProductName, CategoryID, BrandID, PrimaryUnitID, Description, BasePrice, PurchasePrice, FactoryID, Size, Calibre, Choix, QteParColis, QteColisParPalette, IsActive)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)
          ON CONFLICT (ProductID) DO UPDATE SET ProductName = EXCLUDED.ProductName, ProductCode = EXCLUDED.ProductCode, IsActive = true
        `, [
                    p.productid, p.productcode, p.productname, p.categoryid, p.brandid,
                    p.primaryunitid, p.description, p.baseprice, p.purchaseprice, p.factoryid,
                    p.size, p.calibre, p.choix, p.qteparcolis, p.qtecolisparpalette
                ]);

                // Also create inventory record if missing
                const invCheck = await cloudPool.query('SELECT InventoryID FROM Inventory WHERE ProductID = $1', [id]);
                if (invCheck.rows.length === 0) {
                    // Get local inventory
                    const localInv = await localPool.query('SELECT * FROM Inventory WHERE ProductID = $1 LIMIT 1', [id]);
                    if (localInv.rows.length > 0) {
                        const inv = localInv.rows[0];
                        await cloudPool.query(`
              INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, QuantityReserved, PalletCount, ColisCount)
              VALUES ($1, $2, $3, $4, 0, $5, $6)
            `, [id, inv.warehouseid, inv.ownershiptype || 'OWNED', inv.quantityonhand, inv.palletcount, inv.coliscount]);
                    }
                }
            }
            console.log(`    ✅ Done`);
        }

        // ====== STEP 3: Refresh materialized view ======
        console.log('\n=== STEP 3: Refreshing mv_Catalogue on cloud ===');
        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('  ✅ mv_Catalogue refreshed');

        // ====== VERIFICATION ======
        console.log('\n=== VERIFICATION ===');
        const verify = await cloudPool.query(`
      SELECT ProductID, ProductName FROM mv_Catalogue 
      WHERE ProductName ILIKE '%ALMERIA GRIS%' OR ProductID IN (22, 314, 3175, 3638, 3864)
      ORDER BY ProductName
    `);
        console.log('Products now visible:');
        verify.rows.forEach(r => console.log(`  ✅ [${r.productid}] ${r.productname}`));

        console.log('\n✅ ALL SYNC COMPLETE!');

    } catch (err) {
        console.error('Error:', err.message, err.stack);
    } finally {
        localPool.end();
        cloudPool.end();
    }
}

syncToCloud();

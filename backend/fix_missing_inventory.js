const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function fixMissingInventory() {
    // 1. Read the ORIGINAL quantities from deep_duplicates_scan.csv (captured before cleanup)
    const scanPath = path.resolve(__dirname, '..', '..', 'deep_duplicates_scan.csv');
    const scanContent = fs.readFileSync(scanPath, 'utf-8');
    const scanLines = scanContent.trim().split('\n').slice(1);

    // Build original data: group -> [{pid, name, qty, pal, col, isFiche}]
    const originalGroups = new Map();
    for (const line of scanLines) {
        if (!line.trim()) continue;
        const parts = line.match(/"([^"]*)"/g);
        if (!parts || parts.length < 9) continue;
        const groupNum = parts[0].replace(/"/g, '');
        const family = parts[1].replace(/"/g, '');
        const pid = parseInt(parts[2].replace(/"/g, ''));
        const name = parts[4].replace(/"/g, '');
        const qty = parseFloat(parts[5].replace(/"/g, '') || 0);
        const pal = parseFloat(parts[6].replace(/"/g, '') || 0);
        const col = parseFloat(parts[7].replace(/"/g, '') || 0);
        const isFiche = parts[8].replace(/"/g, '') === 'YES';

        if (!originalGroups.has(groupNum)) originalGroups.set(groupNum, []);
        originalGroups.get(groupNum).push({ pid, name, qty, pal, col, isFiche, family });
    }

    // 2. Read the cleanup results to see what was already added
    const resultsPath = path.resolve(__dirname, '..', '..', 'deep_cleanup_results.csv');
    const resultsContent = fs.readFileSync(resultsPath, 'utf-8');
    const resultsLines = resultsContent.trim().split('\n').slice(1);

    // Build: kept_pid -> { qtyAlreadyAdded, oldPid }
    const cleanupResults = new Map();
    for (const line of resultsLines) {
        if (!line.trim()) continue;
        const parts = line.match(/"([^"]*)"/g);
        if (!parts || parts.length < 10) continue;
        const groupNum = parts[0].replace(/"/g, '');
        const keptId = parseInt(parts[3].replace(/"/g, ''));
        const oldId = parseInt(parts[5].replace(/"/g, ''));
        const qtyAdded = parseFloat(parts[7].replace(/"/g, '') || 0);

        if (!cleanupResults.has(groupNum)) cleanupResults.set(groupNum, []);
        cleanupResults.get(groupNum).push({ keptId, oldId, qtyAdded });
    }

    // 3. For each group, check if old products had inventory that wasn't transferred
    const fixes = [];
    for (const [groupNum, products] of originalGroups.entries()) {
        const ficheProducts = products.filter(p => p.isFiche);
        const normalProducts = products.filter(p => !p.isFiche);

        const subGroups = [];
        if (normalProducts.length > 1) subGroups.push(normalProducts);
        if (ficheProducts.length > 1) subGroups.push(ficheProducts);

        for (const sg of subGroups) {
            sg.sort((a, b) => b.pid - a.pid);
            const keep = sg[0];
            const oldProducts = sg.slice(1);

            for (const old of oldProducts) {
                // Check if this old product had qty that wasn't added
                const results = cleanupResults.get(groupNum) || [];
                const result = results.find(r => r.oldId === old.pid && r.keptId === keep.pid);
                const alreadyAdded = result ? result.qtyAdded : 0;

                if (old.qty > 0 && alreadyAdded === 0) {
                    fixes.push({
                        group: groupNum,
                        family: keep.family,
                        keptId: keep.pid,
                        keptName: keep.name,
                        oldId: old.pid,
                        oldName: old.name,
                        missingQty: old.qty,
                        missingPal: old.pal,
                        missingCol: old.col
                    });
                }
            }
        }
    }

    console.log(`Found ${fixes.length} groups where old product stock was NOT transferred.\n`);

    if (fixes.length === 0) {
        console.log('Nothing to fix!');
        cloudPool.end();
        return;
    }

    // 4. Apply fixes
    const client = await cloudPool.connect();
    const fixResults = [];

    try {
        await client.query('BEGIN');

        for (const fix of fixes) {
            console.log(`[Group ${fix.group}] Adding missing stock to [${fix.keptId}] "${fix.keptName}"`);
            console.log(`  From old [${fix.oldId}] "${fix.oldName}": qty=${fix.missingQty}, pal=${fix.missingPal}, col=${fix.missingCol}`);

            // Check if kept product has inventory record
            const keptInv = await client.query(
                'SELECT InventoryID, QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1',
                [fix.keptId]
            );

            if (keptInv.rows.length > 0) {
                await client.query(
                    `UPDATE Inventory SET QuantityOnHand = QuantityOnHand + $1,
                     PalletCount = PalletCount + $2, ColisCount = ColisCount + $3
                     WHERE InventoryID = $4`,
                    [fix.missingQty, fix.missingPal, fix.missingCol, keptInv.rows[0].inventoryid]
                );

                const newInv = await client.query(
                    'SELECT QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE InventoryID = $1',
                    [keptInv.rows[0].inventoryid]
                );
                const finalQty = parseFloat(newInv.rows[0].quantityonhand);
                const finalPal = parseFloat(newInv.rows[0].palletcount);
                const finalCol = parseFloat(newInv.rows[0].coliscount);

                console.log(`  ✅ Updated: qty=${finalQty}, pal=${finalPal}, col=${finalCol}\n`);
                fixResults.push({ ...fix, finalQty, finalPal, finalCol, status: 'FIXED' });
            } else {
                console.log(`  ⚠️ No inventory record for kept product — creating one\n`);
                // Get warehouse/ownership from any existing inventory for reference
                const refInv = await client.query(
                    `SELECT WarehouseID, OwnershipType, FactoryID FROM Inventory LIMIT 1`
                );
                if (refInv.rows.length > 0) {
                    const ref = refInv.rows[0];
                    await client.query(
                        `INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, FactoryID, QuantityOnHand, PalletCount, ColisCount)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [fix.keptId, ref.warehouseid, ref.ownershiptype, ref.factoryid, fix.missingQty, fix.missingPal, fix.missingCol]
                    );
                    fixResults.push({ ...fix, finalQty: fix.missingQty, finalPal: fix.missingPal, finalCol: fix.missingCol, status: 'CREATED' });
                }
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ COMMITTED — ${fixes.length} inventory fixes applied.`);

        // Refresh mv_Catalogue
        console.log('\n--- Refreshing mv_Catalogue ---');
        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        // Save fix report
        let csv = 'Group #,Category/Family,Kept Product ID,Kept Product Name,Old Product ID,Old Product Name,Qty Added,Pal Added,Col Added,Final Qty,Status\n';
        for (const r of fixResults) {
            csv += `"${r.group}","${r.family}","${r.keptId}","${r.keptName.replace(/"/g, '""')}","${r.oldId}","${r.oldName.replace(/"/g, '""')}","${r.missingQty}","${r.missingPal}","${r.missingCol}","${r.finalQty}","${r.status}"\n`;
        }
        const fixPath = path.resolve(__dirname, '..', '..', 'inventory_fix_results.csv');
        fs.writeFileSync(fixPath, csv);
        console.log(`\n✅ Fix results saved to: ${fixPath}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR — rolled back:', err.message, err.stack);
    } finally {
        client.release();
        cloudPool.end();
    }
}

fixMissingInventory();

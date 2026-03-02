const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function correctInventory() {
    // ─── Step 1: Read original scan quantities (before any cleanup) ───
    const scanPath = path.resolve(__dirname, '..', '..', 'deep_duplicates_scan.csv');
    const scanContent = fs.readFileSync(scanPath, 'utf-8');
    const scanLines = scanContent.trim().split('\n').slice(1);

    const originalGroups = new Map();
    for (const line of scanLines) {
        if (!line.trim()) continue;
        const parts = line.match(/"([^"]*)"/g);
        if (!parts || parts.length < 9) continue;
        const groupNum = parts[0].replace(/"/g, '');
        const family = parts[1].replace(/"/g, '');
        const pid = parseInt(parts[2].replace(/"/g, ''));
        const name = parts[4].replace(/"/g, '');
        const origQty = parseFloat(parts[5].replace(/"/g, '') || 0);
        const origPal = parseFloat(parts[6].replace(/"/g, '') || 0);
        const origCol = parseFloat(parts[7].replace(/"/g, '') || 0);
        const isFiche = parts[8].replace(/"/g, '') === 'YES';

        if (!originalGroups.has(groupNum)) originalGroups.set(groupNum, []);
        originalGroups.get(groupNum).push({ pid, name, origQty, origPal, origCol, isFiche, family });
    }

    // ─── Step 2: Read what was already added from cleanup + fix ───
    // From deep_cleanup_results.csv
    const resultsPath = path.resolve(__dirname, '..', '..', 'deep_cleanup_results.csv');
    const resultsContent = fs.readFileSync(resultsPath, 'utf-8');
    const resultsLines = resultsContent.trim().split('\n').slice(1);

    // keptId -> total qty that was added from old products
    const qtyAddedMap = new Map();
    for (const line of resultsLines) {
        if (!line.trim()) continue;
        const parts = line.match(/"([^"]*)"/g);
        if (!parts || parts.length < 10) continue;
        const keptId = parseInt(parts[3].replace(/"/g, ''));
        const qtyAdded = parseFloat(parts[7].replace(/"/g, '') || 0);
        qtyAddedMap.set(keptId, (qtyAddedMap.get(keptId) || 0) + qtyAdded);
    }

    // From inventory_fix_results.csv
    const fixPath = path.resolve(__dirname, '..', '..', 'inventory_fix_results.csv');
    if (fs.existsSync(fixPath)) {
        const fixContent = fs.readFileSync(fixPath, 'utf-8');
        const fixLines = fixContent.trim().split('\n').slice(1);
        for (const line of fixLines) {
            if (!line.trim()) continue;
            const parts = line.match(/"([^"]*)"/g);
            if (!parts || parts.length < 9) continue;
            const keptId = parseInt(parts[2].replace(/"/g, ''));
            const qtyAdded = parseFloat(parts[6].replace(/"/g, '') || 0);
            qtyAddedMap.set(keptId, (qtyAddedMap.get(keptId) || 0) + qtyAdded);
        }
    }

    // ─── Step 3: Build the list of corrections ───
    const client = await cloudPool.connect();
    const corrections = [];

    try {
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
                    // Query: total qty SOLD from old product (OrderItems on non-cancelled orders)
                    const salesRes = await client.query(`
                        SELECT COALESCE(SUM(oi.Quantity), 0) as total_sold
                        FROM OrderItems oi
                        JOIN Orders o ON oi.OrderID = o.OrderID
                        WHERE oi.ProductID = $1
                          AND o.Status NOT IN ('CANCELLED')
                    `, [keep.pid]); // OrderItems were already reassigned to keep.pid, so query keep.pid
                    // But we need only the orders that ORIGINALLY belonged to old product
                    // Problem: OrderItems were already reassigned, so we can't distinguish them now

                    // Alternative: use the order history CSV which was captured BEFORE cleanup
                    // Let's query what we can from the reassigned data

                    corrections.push({
                        group: groupNum,
                        family: keep.family,
                        keptId: keep.pid,
                        keptName: keep.name,
                        keptOrigQty: keep.origQty,
                        oldId: old.pid,
                        oldName: old.name,
                        oldOrigQty: old.origQty,
                        oldOrigPal: old.origPal,
                        oldOrigCol: old.origCol,
                        totalPrevAdded: qtyAddedMap.get(keep.pid) || 0
                    });
                }
            }
        }

        // ─── Step 4: Use the order history CSV (captured before cleanup) for old product transactions ───
        const historyPath = path.resolve(__dirname, '..', '..', 'duplicates_order_history.csv');
        const historyContent = fs.readFileSync(historyPath, 'utf-8');
        const historyLines = historyContent.trim().split('\n').slice(1);

        // pid -> {salesCount, totalSold, purchaseCount, totalPurchased}
        const historyMap = new Map();
        for (const line of historyLines) {
            if (!line.trim()) continue;
            const parts = line.match(/"([^"]*)"/g);
            if (!parts || parts.length < 13) continue;
            const pid = parseInt(parts[2].replace(/"/g, ''));
            const salesOrders = parseInt(parts[5].replace(/"/g, '') || 0);
            const totalSold = parseFloat(parts[7].replace(/"/g, '') || 0);
            const purchaseOrders = parseInt(parts[9].replace(/"/g, '') || 0);
            const totalPurchased = parseFloat(parts[11].replace(/"/g, '') || 0);
            historyMap.set(pid, { salesOrders, totalSold, purchaseOrders, totalPurchased });
        }

        // ─── Step 5: Calculate and apply corrections ───
        await client.query('BEGIN');

        let csv = 'Group #,Family,Kept ID,Kept Name,Kept Orig Qty,Old ID,Old Name,Old Orig Qty,Old Sales Qty,Old Purchase Qty,Prev Wrongly Added,Correction Applied,Final Qty\n';
        let fixCount = 0;

        for (const c of corrections) {
            const oldHistory = historyMap.get(c.oldId) || { salesOrders: 0, totalSold: 0, purchaseOrders: 0, totalPurchased: 0 };

            // The correct adjustment = purchases on old (stock came in) - sales on old (stock went out)
            // Sales on old product = real outflow that should reduce the kept product
            // Purchases on old product = real inflow that should increase the kept product
            const correctAdjustment = oldHistory.totalPurchased - oldHistory.totalSold;

            // What was wrongly added before = old product's full inventory
            // We need to reverse the wrong addition and apply the correct adjustment
            // Current kept qty = keptOrigQty + totalPrevAdded (wrong merge)
            // Correct kept qty = keptOrigQty + correctAdjustment
            // Therefore correction = correctAdjustment - totalPrevAdded

            // But totalPrevAdded was only applied to specific kept products, not always
            // Let's be precise: for this specific old product, what was added?
            let prevAdded = 0;
            // Check deep_cleanup_results for this specific old -> kept pair
            for (const line of resultsLines) {
                if (!line.trim()) continue;
                const parts = line.match(/"([^"]*)"/g);
                if (!parts || parts.length < 10) continue;
                const keptId = parseInt(parts[3].replace(/"/g, ''));
                const oldId = parseInt(parts[5].replace(/"/g, ''));
                const qa = parseFloat(parts[7].replace(/"/g, '') || 0);
                if (keptId === c.keptId && oldId === c.oldId) {
                    prevAdded += qa;
                }
            }
            // Also check fix results
            if (fs.existsSync(fixPath)) {
                const fixContent2 = fs.readFileSync(fixPath, 'utf-8');
                const fixLines2 = fixContent2.trim().split('\n').slice(1);
                for (const line of fixLines2) {
                    if (!line.trim()) continue;
                    const parts = line.match(/"([^"]*)"/g);
                    if (!parts || parts.length < 9) continue;
                    const keptId = parseInt(parts[2].replace(/"/g, ''));
                    const oldId = parseInt(parts[4].replace(/"/g, ''));
                    const qa = parseFloat(parts[6].replace(/"/g, '') || 0);
                    if (keptId === c.keptId && oldId === c.oldId) {
                        prevAdded += qa;
                    }
                }
            }

            const netCorrection = correctAdjustment - prevAdded;

            if (Math.abs(netCorrection) > 0.001) {
                fixCount++;
                console.log(`[Group ${c.group}] [${c.keptId}] "${c.keptName}"`);
                console.log(`  Old [${c.oldId}] had: sales=${oldHistory.totalSold}, purchases=${oldHistory.totalPurchased}`);
                console.log(`  Correct adjustment: ${correctAdjustment} | Previously added: ${prevAdded} | Net correction: ${netCorrection}`);

                const keptInv = await client.query(
                    'SELECT InventoryID, QuantityOnHand FROM Inventory WHERE ProductID = $1',
                    [c.keptId]
                );

                if (keptInv.rows.length > 0) {
                    await client.query(
                        'UPDATE Inventory SET QuantityOnHand = QuantityOnHand + $1 WHERE InventoryID = $2',
                        [netCorrection, keptInv.rows[0].inventoryid]
                    );
                    const newInv = await client.query(
                        'SELECT QuantityOnHand FROM Inventory WHERE InventoryID = $1',
                        [keptInv.rows[0].inventoryid]
                    );
                    const finalQty = parseFloat(newInv.rows[0].quantityonhand);
                    console.log(`  ✅ Final qty: ${finalQty}\n`);

                    csv += `"${c.group}","${c.family}","${c.keptId}","${c.keptName.replace(/"/g, '""')}","${c.keptOrigQty}","${c.oldId}","${c.oldName.replace(/"/g, '""')}","${c.oldOrigQty}","${oldHistory.totalSold}","${oldHistory.totalPurchased}","${prevAdded}","${netCorrection}","${finalQty}"\n`;
                } else {
                    console.log(`  ⚠️ No inventory record\n`);
                    csv += `"${c.group}","${c.family}","${c.keptId}","${c.keptName.replace(/"/g, '""')}","${c.keptOrigQty}","${c.oldId}","${c.oldName.replace(/"/g, '""')}","${c.oldOrigQty}","${oldHistory.totalSold}","${oldHistory.totalPurchased}","${prevAdded}","${netCorrection}","NO_INV"\n`;
                }
            } else {
                // No correction needed (no old transactions, no prev additions)
                const keptInv = await client.query(
                    'SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1', [c.keptId]
                );
                const curQty = keptInv.rows.length > 0 ? parseFloat(keptInv.rows[0].quantityonhand) : 0;
                csv += `"${c.group}","${c.family}","${c.keptId}","${c.keptName.replace(/"/g, '""')}","${c.keptOrigQty}","${c.oldId}","${c.oldName.replace(/"/g, '""')}","${c.oldOrigQty}","${oldHistory.totalSold}","${oldHistory.totalPurchased}","${prevAdded}","0","${curQty}"\n`;
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ COMMITTED — ${fixCount} inventory corrections applied.`);

        // Refresh
        console.log('\n--- Refreshing mv_Catalogue ---');
        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        const outPath = path.resolve(__dirname, '..', '..', 'inventory_correction_results.csv');
        fs.writeFileSync(outPath, csv);
        console.log(`✅ Results saved to: ${outPath}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR — rolled back:', err.message, err.stack);
    } finally {
        client.release();
        cloudPool.end();
    }
}

correctInventory();

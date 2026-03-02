const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

function isFiche(name) {
    return /^FICHE\s*:/i.test(name.trim());
}

// Aggressive normalize: strip FICHE:, strip REC, slashes→space, encoding variants
function normalize(name) {
    return name.toUpperCase()
        .replace(/FICHE\s*:\s*/g, '')
        .replace(/\bREC\b/g, '')
        .replace(/[\/\+\-\(\)\.\,\:\;\'\"\`\´\ï]/g, ' ')
        .replace(/2[ée]me/gi, '2EME')
        .replace(/\b2me\b/gi, '2EME')
        .replace(/M[²ý]/g, 'M2')
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Sorted word key
function sortedKey(name) {
    return normalize(name).split(/\s+/).filter(w => w).sort().join(' ');
}

// Truncated sorted word key (e.g., POL → POL, POLI → POL)
function truncKey(name) {
    return normalize(name).split(/\s+/).filter(w => w).map(w => w.length > 3 ? w.substring(0, 3) : w).sort().join(' ');
}

// Levenshtein
function lev(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n; if (n === 0) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1); r[0] = i; return r; });
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[m][n];
}

async function finalCleanup() {
    console.log('=== FINAL DUPLICATE CLEANUP ===\n');
    console.log('Fetching all active products...\n');

    const result = await cloudPool.query(`
        SELECT p.ProductID, p.ProductName, p.ProductCode,
               b.BrandName, c.CategoryName
        FROM Products p
        LEFT JOIN Brands b ON p.BrandID = b.BrandID
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = true
        ORDER BY p.ProductID
    `);
    const products = result.rows;
    console.log(`Fetched ${products.length} active products.\n`);

    // ─── Strategy 1: Sorted word key (true dupes only: 2+ normal OR 2+ FICHE OR 3+) ───
    const s1 = new Map();
    for (const p of products) {
        const key = sortedKey(p.productname);
        if (!s1.has(key)) s1.set(key, []);
        s1.get(key).push(p);
    }

    // ─── Strategy 2: Truncated word key ───
    const s2 = new Map();
    for (const p of products) {
        const key = truncKey(p.productname);
        if (!s2.has(key)) s2.set(key, []);
        s2.get(key).push(p);
    }

    // ─── Strategy 3: Levenshtein on normalized names, same brand+dimensions ───
    const brandDimGroups = new Map();
    for (const p of products) {
        const brand = (p.brandname || p.categoryname || '').toUpperCase();
        const dimMatch = p.productname.match(/(\d+[\/\*x]\d+)/i);
        const dim = dimMatch ? dimMatch[1] : '';
        const key = `${brand}|${dim}`;
        if (!brandDimGroups.has(key)) brandDimGroups.set(key, []);
        brandDimGroups.get(key).push(p);
    }

    // Collect all duplicate pairs
    const pairMap = new Map(); // "id1-id2" -> { ids, products, strategy }

    function addGroup(group, strategy) {
        if (group.length < 2) return;
        const fiche = group.filter(p => isFiche(p.productname));
        const normal = group.filter(p => !isFiche(p.productname));

        // Only true dupes: 2+ normal, 2+ fiche, or 3+ total
        if (normal.length < 2 && fiche.length < 2 && group.length < 3) return;

        const ids = group.map(p => p.productid).sort((a, b) => a - b);
        const key = ids.join('-');
        if (!pairMap.has(key)) pairMap.set(key, { products: group, strategy });
    }

    for (const [, group] of s1) addGroup(group, 'SortedWord');
    for (const [, group] of s2) addGroup(group, 'TruncWord');

    // Levenshtein: only within brand+dim, only if distance <= 2 on normalized, and must be real duplicates not just similar products
    for (const [, group] of brandDimGroups) {
        if (group.length < 2 || group.length > 50) continue;
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const n1 = normalize(group[i].productname);
                const n2 = normalize(group[j].productname);
                if (Math.abs(n1.length - n2.length) > 3) continue;
                const dist = lev(n1, n2);
                if (dist > 0 && dist <= 2) {
                    // Extra filter: both must have exact same set of numbers (dimensions, sizes)
                    const nums1 = n1.match(/\d+/g) || [];
                    const nums2 = n2.match(/\d+/g) || [];
                    if (nums1.join(',') !== nums2.join(',') &&
                        !(n1.includes('2EME') || n2.includes('2EME') || n1.includes('M2') || n2.includes('M2'))) continue;

                    const pair = [group[i], group[j]];
                    const ids = pair.map(p => p.productid).sort((a, b) => a - b);
                    const key = ids.join('-');
                    if (!pairMap.has(key)) pairMap.set(key, { products: pair, strategy: `Fuzzy(d=${dist})` });
                }
            }
        }
    }

    console.log(`Found ${pairMap.size} potential duplicate groups before validation.\n`);

    // ─── Validate: Manual exclusion of known false positives ───
    const validGroups = [];
    for (const [, info] of pairMap) {
        const { products: group, strategy } = info;
        const names = group.map(p => normalize(p.productname));

        // Exclude: different product codes (e.g., SIEGE models with different codes 1701/1710/1720)
        // Only exclude if all names are fully digit-different (like different model numbers)
        const baseNames = names.map(n => n.replace(/\d+/g, 'N'));
        const allSameBase = baseNames.every(b => b === baseNames[0]);

        // Exclude fuzzy matches where base product name differs (different product entirely)
        if (strategy.startsWith('Fuzzy') && !allSameBase) continue;

        // Exclude: products that differ ONLY in their model number suffix (SIEGE SEPARE AQUA BEL 1701 vs 1710)
        if (strategy.startsWith('Fuzzy')) {
            const words1 = names[0].split(/\s+/);
            const words2 = names[1].split(/\s+/);
            if (words1.length === words2.length) {
                let diffCount = 0;
                let diffIsNumber = true;
                for (let k = 0; k < words1.length; k++) {
                    if (words1[k] !== words2[k]) {
                        diffCount++;
                        if (!/^\d+$/.test(words1[k]) || !/^\d+$/.test(words2[k])) diffIsNumber = false;
                    }
                }
                if (diffCount === 1 && diffIsNumber) continue; // Different model number, not a duplicate
            }
        }

        validGroups.push(info);
    }

    console.log(`After validation: ${validGroups.length} true duplicate groups.\n`);

    if (validGroups.length === 0) {
        console.log('✅ No duplicates found!');
        cloudPool.end();
        return;
    }

    // Get inventory and order data
    const allIds = new Set();
    for (const g of validGroups) for (const p of g.products) allIds.add(p.productid);

    const invResult = await cloudPool.query(
        `SELECT ProductID, SUM(QuantityOnHand) as qty, SUM(PalletCount) as pal, SUM(ColisCount) as col 
         FROM Inventory WHERE ProductID = ANY($1) GROUP BY ProductID`,
        [Array.from(allIds)]
    );
    const invMap = new Map();
    for (const r of invResult.rows) invMap.set(r.productid, {
        qty: parseFloat(r.qty || 0), pal: parseFloat(r.pal || 0), col: parseFloat(r.col || 0)
    });

    const salesRes = await cloudPool.query(
        `SELECT oi.ProductID, SUM(oi.Quantity) as total_sold
         FROM OrderItems oi JOIN Orders o ON oi.OrderID = o.OrderID
         WHERE oi.ProductID = ANY($1) AND o.Status NOT IN ('CANCELLED')
         GROUP BY oi.ProductID`,
        [Array.from(allIds)]
    );
    const salesMap = new Map();
    for (const r of salesRes.rows) salesMap.set(r.productid, parseFloat(r.total_sold || 0));

    const poRes = await cloudPool.query(
        `SELECT poi.ProductID, SUM(poi.Quantity) as total_purchased
         FROM PurchaseOrderItems poi JOIN PurchaseOrders po ON poi.PurchaseOrderID = po.PurchaseOrderID
         WHERE poi.ProductID = ANY($1) AND po.Status NOT IN ('CANCELLED')
         GROUP BY poi.ProductID`,
        [Array.from(allIds)]
    );
    const poMap = new Map();
    for (const r of poRes.rows) poMap.set(r.productid, parseFloat(r.total_purchased || 0));

    // ─── CLEANUP ───
    const client = await cloudPool.connect();
    const results = [];
    let groupNum = 0;
    let errors = 0;

    try {
        await client.query('BEGIN');

        for (const { products: group, strategy } of validGroups) {
            groupNum++;
            const ficheProducts = group.filter(p => isFiche(p.productname));
            const normalProducts = group.filter(p => !isFiche(p.productname));

            const subGroups = [];
            if (normalProducts.length > 1) subGroups.push({ type: 'PRODUCT', items: normalProducts });
            if (ficheProducts.length > 1) subGroups.push({ type: 'FICHE', items: ficheProducts });

            for (const sg of subGroups) {
                sg.items.sort((a, b) => b.productid - a.productid);
                const keep = sg.items[0];
                const olds = sg.items.slice(1);

                for (const old of olds) {
                    try {
                        const family = keep.brandname || keep.categoryname || 'Unknown';
                        const keepInv = invMap.get(keep.productid) || { qty: 0, pal: 0, col: 0 };
                        const oldInv = invMap.get(old.productid) || { qty: 0, pal: 0, col: 0 };
                        const oldSold = salesMap.get(old.productid) || 0;
                        const oldPurchased = poMap.get(old.productid) || 0;
                        // Net adjustment = purchases - sales on old product
                        const netAdj = oldPurchased - oldSold;

                        console.log(`[Group ${groupNum}] [${strategy}] Keeping [${keep.productid}] "${keep.productname}" | Deactivating [${old.productid}] "${old.productname}"`);
                        if (oldSold > 0 || oldPurchased > 0) {
                            console.log(`  Old had: sold=${oldSold}, purchased=${oldPurchased}, net adjustment=${netAdj}`);
                        }

                        // Reassign all references
                        const tables = [
                            { name: 'OrderItems', col: 'ProductID' },
                            { name: 'PurchaseOrderItems', col: 'ProductID' },
                            { name: 'InventoryTransactions', col: 'ProductID' },
                            { name: 'GoodsReceiptItems', col: 'ProductID' },
                            { name: 'BuyingPrices', col: 'ProductID' },
                            { name: 'CustomerProductPrices', col: 'ProductID' },
                            { name: 'PriceListItems', col: 'ProductID' }
                        ];

                        for (const t of tables) {
                            const cnt = await client.query(`SELECT COUNT(*) as c FROM ${t.name} WHERE ${t.col} = $1`, [old.productid]);
                            const count = parseInt(cnt.rows[0].c);
                            if (count > 0) {
                                console.log(`  Reassigning ${count} ${t.name} → [${keep.productid}]`);
                                await client.query(`UPDATE ${t.name} SET ${t.col} = $1 WHERE ${t.col} = $2`, [keep.productid, old.productid]);
                            }
                        }

                        // Adjust inventory based on net transactions of old product
                        if (Math.abs(netAdj) > 0.001) {
                            const keptInvRow = await client.query('SELECT InventoryID FROM Inventory WHERE ProductID = $1', [keep.productid]);
                            if (keptInvRow.rows.length > 0) {
                                await client.query('UPDATE Inventory SET QuantityOnHand = QuantityOnHand + $1 WHERE InventoryID = $2',
                                    [netAdj, keptInvRow.rows[0].inventoryid]);
                                console.log(`  📦 Inventory adjusted: net ${netAdj > 0 ? '+' : ''}${netAdj}`);
                            }
                        }

                        // Delete old inventory
                        await client.query('DELETE FROM Inventory WHERE ProductID = $1', [old.productid]);

                        // Deactivate old product
                        await client.query('UPDATE Products SET IsActive = false, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $1', [old.productid]);

                        // Get final qty
                        const finalInv = await client.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1', [keep.productid]);
                        const finalQty = finalInv.rows.length > 0 ? parseFloat(finalInv.rows[0].quantityonhand) : 0;

                        console.log(`  ✅ Done. Final qty: ${finalQty}\n`);

                        results.push({
                            group: groupNum, strategy, family,
                            keptId: keep.productid, keptName: keep.productname,
                            oldId: old.productid, oldName: old.productname,
                            oldSold, oldPurchased, netAdj, finalQty
                        });
                    } catch (err) {
                        errors++;
                        console.error(`  ❌ Error: ${err.message}\n`);
                    }
                }
            }
        }

        if (errors === 0) {
            await client.query('COMMIT');
            console.log(`\n✅ COMMITTED — ${results.length} products deactivated across ${groupNum} groups.`);
        } else {
            await client.query('ROLLBACK');
            console.log(`\n❌ ROLLED BACK — ${errors} errors.`);
        }

        // Refresh
        if (errors === 0) {
            console.log('\n--- Refreshing mv_Catalogue ---');
            await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('✅ mv_Catalogue refreshed');
        }

        // CSV
        let csv = 'Group #,Strategy,Family,Kept ID,Kept Name,Old ID,Old Name,Old Sold,Old Purchased,Net Adj,Final Qty\n';
        for (const r of results) {
            csv += `"${r.group}","${r.strategy}","${r.family}","${r.keptId}","${r.keptName.replace(/"/g, '""')}","${r.oldId}","${r.oldName.replace(/"/g, '""')}","${r.oldSold}","${r.oldPurchased}","${r.netAdj}","${r.finalQty}"\n`;
        }
        const outPath = path.resolve(__dirname, '..', '..', 'final_cleanup_results.csv');
        fs.writeFileSync(outPath, csv);
        console.log(`\n✅ Results saved to: ${outPath}`);
        console.log(`\n✅✅✅ FINAL CLEANUP COMPLETE! Groups: ${groupNum}, Deactivated: ${results.length}, Errors: ${errors} ✅✅✅`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ FATAL:', err.message, err.stack);
    } finally {
        client.release();
        cloudPool.end();
    }
}

finalCleanup();

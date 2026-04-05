const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

// ─── Parse the CSV to extract duplicate pairs ───
function parseDuplicatePairs() {
    const csvPath = path.resolve(__dirname, '..', '..', 'detailed_duplicates_report.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n').slice(1); // skip header

    // Parse all rows
    const rows = lines.filter(l => l.trim()).map(line => {
        const match = line.match(/"([^"]*)","([^"]*)","(\d+)","([^"]*)","([^"]*)"/);
        if (!match) return null;
        return {
            category: match[1],
            groupType: match[2],
            productId: parseInt(match[3]),
            productCode: match[4],
            productName: match[5]
        };
    }).filter(Boolean);

    // Group into pairs (consecutive rows):
    // Within the same category and group type, group products by their normalized base name
    const pairMap = new Map(); // key -> [row1, row2, ...]

    for (const row of rows) {
        // Normalize: remove REC, collapse spaces, lowercase
        const baseName = row.productName
            .replace(/\bREC\b/gi, '')
            .replace(/FICHE\s*:\s*/gi, 'FICHE:')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const key = `${row.category}||${baseName}`;
        if (!pairMap.has(key)) pairMap.set(key, []);
        pairMap.get(key).push(row);
    }

    // Extract unique pairs: for each group, keep the most recent (highest ID) and deactivate the rest
    const seen = new Set();
    const pairs = [];

    for (const [, group] of pairMap.entries()) {
        if (group.length < 2) continue;

        // Sort by productId descending — highest is "most recent"
        group.sort((a, b) => b.productId - a.productId);
        const keep = group[0];
        for (let i = 1; i < group.length; i++) {
            const old = group[i];
            const pairKey = [Math.min(keep.productId, old.productId), Math.max(keep.productId, old.productId)].join('-');
            if (seen.has(pairKey)) continue;
            seen.add(pairKey);
            pairs.push({ keep, old });
        }
    }

    console.log(`Parsed ${pairs.length} unique duplicate pairs from CSV.\n`);
    return pairs;
}

async function cleanupDuplicates() {
    const pairs = parseDuplicatePairs();
    const client = await cloudPool.connect();
    const results = [];

    try {
        await client.query('BEGIN');

        for (const { keep, old } of pairs) {
            console.log(`--- Keeping [${keep.productId}] "${keep.productName}" | Deactivating [${old.productId}] "${old.productName}" ---`);

            // 1. Get the quantity of the KEPT product (the recent one)
            const keptInv = await client.query(
                'SELECT QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1',
                [keep.productId]
            );
            const keptQty = keptInv.rows.length > 0 ? parseFloat(keptInv.rows[0].quantityonhand || 0) : 0;
            const keptPal = keptInv.rows.length > 0 ? parseFloat(keptInv.rows[0].palletcount || 0) : 0;
            const keptCol = keptInv.rows.length > 0 ? parseFloat(keptInv.rows[0].coliscount || 0) : 0;
            console.log(`  Kept product quantity: ${keptQty} (pallets: ${keptPal}, colis: ${keptCol})`);

            // 2. Re-point OrderItems from old → keep
            const oi = await client.query('SELECT COUNT(*) as cnt FROM OrderItems WHERE ProductID = $1', [old.productId]);
            const oiCount = parseInt(oi.rows[0].cnt);
            if (oiCount > 0) {
                console.log(`  Reassigning ${oiCount} OrderItems → [${keep.productId}]`);
                await client.query('UPDATE OrderItems SET ProductID = $1 WHERE ProductID = $2', [keep.productId, old.productId]);
            }

            // 3. Re-point PurchaseOrderItems from old → keep
            const poi = await client.query('SELECT COUNT(*) as cnt FROM PurchaseOrderItems WHERE ProductID = $1', [old.productId]);
            const poiCount = parseInt(poi.rows[0].cnt);
            if (poiCount > 0) {
                console.log(`  Reassigning ${poiCount} PurchaseOrderItems → [${keep.productId}]`);
                await client.query('UPDATE PurchaseOrderItems SET ProductID = $1 WHERE ProductID = $2', [keep.productId, old.productId]);
            }

            // 4. Re-point InventoryTransactions from old → keep
            const itx = await client.query('SELECT COUNT(*) as cnt FROM InventoryTransactions WHERE ProductID = $1', [old.productId]);
            const itxCount = parseInt(itx.rows[0].cnt);
            if (itxCount > 0) {
                console.log(`  Reassigning ${itxCount} InventoryTransactions → [${keep.productId}]`);
                await client.query('UPDATE InventoryTransactions SET ProductID = $1 WHERE ProductID = $2', [keep.productId, old.productId]);
            }

            // 5. Re-point GoodsReceiptItems from old → keep
            const gri = await client.query('SELECT COUNT(*) as cnt FROM GoodsReceiptItems WHERE ProductID = $1', [old.productId]);
            const griCount = parseInt(gri.rows[0].cnt);
            if (griCount > 0) {
                console.log(`  Reassigning ${griCount} GoodsReceiptItems → [${keep.productId}]`);
                await client.query('UPDATE GoodsReceiptItems SET ProductID = $1 WHERE ProductID = $2', [keep.productId, old.productId]);
            }

            // 6. Re-point BuyingPrices from old → keep
            const bp = await client.query('SELECT COUNT(*) as cnt FROM BuyingPrices WHERE ProductID = $1', [old.productId]);
            const bpCount = parseInt(bp.rows[0].cnt);
            if (bpCount > 0) {
                console.log(`  Reassigning ${bpCount} BuyingPrices → [${keep.productId}]`);
                await client.query('UPDATE BuyingPrices SET ProductID = $1 WHERE ProductID = $2', [keep.productId, old.productId]);
            }

            // 7. Re-point CustomerProductPrices from old → keep
            const cpp = await client.query('SELECT COUNT(*) as cnt FROM CustomerProductPrices WHERE ProductID = $1', [old.productId]);
            const cppCount = parseInt(cpp.rows[0].cnt);
            if (cppCount > 0) {
                console.log(`  Reassigning ${cppCount} CustomerProductPrices → [${keep.productId}]`);
                await client.query('UPDATE CustomerProductPrices SET ProductID = $1 WHERE ProductID = $2', [keep.productId, old.productId]);
            }

            // 8. Re-point PriceListItems from old → keep
            const pli = await client.query('SELECT COUNT(*) as cnt FROM PriceListItems WHERE ProductID = $1', [old.productId]);
            const pliCount = parseInt(pli.rows[0].cnt);
            if (pliCount > 0) {
                console.log(`  Reassigning ${pliCount} PriceListItems → [${keep.productId}]`);
                await client.query('UPDATE PriceListItems SET ProductID = $1 WHERE ProductID = $2', [keep.productId, old.productId]);
            }

            // 9. Delete old inventory records
            await client.query('DELETE FROM Inventory WHERE ProductID = $1', [old.productId]);

            // 10. Deactivate the old product
            await client.query(
                'UPDATE Products SET IsActive = false, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $1',
                [old.productId]
            );
            console.log(`  ✅ [${old.productId}] deactivated\n`);

            results.push({
                category: keep.category,
                productNameKept: keep.productName,
                keptProductId: keep.productId,
                oldProductId: old.productId,
                quantity: keptQty
            });
        }

        await client.query('COMMIT');
        console.log(`\n✅ All ${pairs.length} duplicate pairs processed successfully.`);

        // Refresh mv_Catalogue
        console.log('\n--- Refreshing mv_Catalogue ---');
        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        // Generate results CSV
        let csv = 'Category/Family,Product Name (Kept),Kept Product ID,Old Product ID,Quantity\n';
        for (const r of results) {
            csv += `"${r.category}","${r.productNameKept}","${r.keptProductId}","${r.oldProductId}","${r.quantity}"\n`;
        }

        const outputPath = path.resolve(__dirname, '..', '..', 'duplicate_cleanup_results.csv');
        fs.writeFileSync(outputPath, csv);
        console.log(`\n✅ Results CSV saved to: ${outputPath}`);

        // Verification: check remaining duplicates
        const remaining = await cloudPool.query(`
            SELECT ProductName, COUNT(*) as cnt
            FROM Products WHERE IsActive = true
            GROUP BY ProductName HAVING COUNT(*) > 1
        `);
        if (remaining.rows.length === 0) {
            console.log('✅ No more duplicates among active products!');
        } else {
            console.log(`⚠️ ${remaining.rows.length} product name duplicates still remain among active products:`);
            remaining.rows.forEach(r => console.log(`  "${r.productname}" x${r.cnt}`));
        }

        console.log('\n✅✅✅ DUPLICATE CLEANUP COMPLETE! ✅✅✅');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR — rolled back:', err.message, err.stack);
    } finally {
        client.release();
        cloudPool.end();
    }
}

cleanupDuplicates();

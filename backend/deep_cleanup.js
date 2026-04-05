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

async function cleanupAllDuplicates() {
    // Read the deep duplicates CSV
    const csvPath = path.resolve(__dirname, '..', '..', 'deep_duplicates_scan.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n').slice(1);

    // Parse into groups
    const groupMap = new Map();
    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.match(/"([^"]*)"/g);
        if (!parts || parts.length < 9) continue;
        const groupNum = parts[0].replace(/"/g, '');
        const family = parts[1].replace(/"/g, '');
        const pid = parseInt(parts[2].replace(/"/g, ''));
        const name = parts[4].replace(/"/g, '');
        const qty = parseFloat(parts[5].replace(/"/g, '') || 0);
        const isFicheProduct = parts[8].replace(/"/g, '') === 'YES';

        if (!groupMap.has(groupNum)) groupMap.set(groupNum, []);
        groupMap.get(groupNum).push({ pid, name, qty, family, isFicheProduct });
    }

    console.log(`Loaded ${groupMap.size} duplicate groups.\n`);

    const client = await cloudPool.connect();
    const results = [];
    let processedCount = 0;
    let errorCount = 0;

    try {
        await client.query('BEGIN');

        for (const [groupNum, products] of groupMap.entries()) {
            // Separate FICHE and non-FICHE products
            const ficheProducts = products.filter(p => p.isFicheProduct);
            const normalProducts = products.filter(p => !p.isFicheProduct);

            // Determine sub-groups to clean:
            // 1. Among non-FICHE: keep most recent, deactivate rest
            // 2. Among FICHE: keep most recent, deactivate rest
            const subGroups = [];
            if (normalProducts.length > 1) {
                subGroups.push({ type: 'PRODUCT', items: normalProducts });
            }
            if (ficheProducts.length > 1) {
                subGroups.push({ type: 'FICHE', items: ficheProducts });
            }
            // If there are no sub-groups with >1 items in same type, 
            // but total group > 2 (triplet with 1 FICHE + 2 non-FICHE etc.)
            // The above handles it: normalProducts.length > 1 catches the 2 non-FICHE

            for (const sg of subGroups) {
                // Sort by PID descending — highest (most recent) first
                sg.items.sort((a, b) => b.pid - a.pid);
                const keep = sg.items[0];
                const oldProducts = sg.items.slice(1);

                for (const old of oldProducts) {
                    processedCount++;
                    console.log(`[Group ${groupNum}] Keeping [${keep.pid}] "${keep.name}" | Deactivating [${old.pid}] "${old.name}"`);

                    try {
                        // ─── Check if old product had any order activity ───
                        const oldSales = await client.query(
                            `SELECT COUNT(*) as cnt FROM OrderItems WHERE ProductID = $1`, [old.pid]
                        );
                        const oldSalesCount = parseInt(oldSales.rows[0].cnt);

                        const oldPurchases = await client.query(
                            `SELECT COUNT(*) as cnt FROM PurchaseOrderItems WHERE ProductID = $1`, [old.pid]
                        );
                        const oldPurchasesCount = parseInt(oldPurchases.rows[0].cnt);

                        // ─── Get old product inventory ───
                        const oldInv = await client.query(
                            `SELECT QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1`, [old.pid]
                        );
                        const oldQty = oldInv.rows.length > 0 ? parseFloat(oldInv.rows[0].quantityonhand || 0) : 0;
                        const oldPal = oldInv.rows.length > 0 ? parseFloat(oldInv.rows[0].palletcount || 0) : 0;
                        const oldCol = oldInv.rows.length > 0 ? parseFloat(oldInv.rows[0].coliscount || 0) : 0;

                        // ─── Get kept product inventory ───
                        const keptInv = await client.query(
                            `SELECT InventoryID, QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1`, [keep.pid]
                        );
                        const keptQty = keptInv.rows.length > 0 ? parseFloat(keptInv.rows[0].quantityonhand || 0) : 0;
                        const keptPal = keptInv.rows.length > 0 ? parseFloat(keptInv.rows[0].palletcount || 0) : 0;
                        const keptCol = keptInv.rows.length > 0 ? parseFloat(keptInv.rows[0].coliscount || 0) : 0;

                        // ─── If old product had transactions, compute net inventory impact ───
                        // Check net IN/OUT from InventoryTransactions for the old product
                        let qtyAdjustment = 0, palAdjustment = 0, colAdjustment = 0;

                        if (oldSalesCount > 0 || oldPurchasesCount > 0) {
                            // The old product had real orders. Its inventory reflects real transactions.
                            // We need to add the old product's remaining inventory to the kept product
                            // so we don't lose track of stock that was managed under the old ID.
                            qtyAdjustment = oldQty;
                            palAdjustment = oldPal;
                            colAdjustment = oldCol;

                            if (qtyAdjustment !== 0 || palAdjustment !== 0 || colAdjustment !== 0) {
                                console.log(`  📦 Old product had orders — adding remaining stock: qty=${qtyAdjustment}, pal=${palAdjustment}, col=${colAdjustment}`);
                                if (keptInv.rows.length > 0) {
                                    await client.query(
                                        `UPDATE Inventory SET QuantityOnHand = QuantityOnHand + $1, 
                                         PalletCount = PalletCount + $2, ColisCount = ColisCount + $3 
                                         WHERE InventoryID = $4`,
                                        [qtyAdjustment, palAdjustment, colAdjustment, keptInv.rows[0].inventoryid]
                                    );
                                }
                            }
                        }

                        // ─── Reassign OrderItems ───
                        if (oldSalesCount > 0) {
                            console.log(`  Reassigning ${oldSalesCount} OrderItems → [${keep.pid}]`);
                            await client.query('UPDATE OrderItems SET ProductID = $1 WHERE ProductID = $2', [keep.pid, old.pid]);
                        }

                        // ─── Reassign PurchaseOrderItems ───
                        if (oldPurchasesCount > 0) {
                            console.log(`  Reassigning ${oldPurchasesCount} PurchaseOrderItems → [${keep.pid}]`);
                            await client.query('UPDATE PurchaseOrderItems SET ProductID = $1 WHERE ProductID = $2', [keep.pid, old.pid]);
                        }

                        // ─── Reassign InventoryTransactions ───
                        const itx = await client.query('SELECT COUNT(*) as cnt FROM InventoryTransactions WHERE ProductID = $1', [old.pid]);
                        const itxCount = parseInt(itx.rows[0].cnt);
                        if (itxCount > 0) {
                            console.log(`  Reassigning ${itxCount} InventoryTransactions → [${keep.pid}]`);
                            await client.query('UPDATE InventoryTransactions SET ProductID = $1 WHERE ProductID = $2', [keep.pid, old.pid]);
                        }

                        // ─── Reassign GoodsReceiptItems ───
                        const gri = await client.query('SELECT COUNT(*) as cnt FROM GoodsReceiptItems WHERE ProductID = $1', [old.pid]);
                        if (parseInt(gri.rows[0].cnt) > 0) {
                            console.log(`  Reassigning ${gri.rows[0].cnt} GoodsReceiptItems → [${keep.pid}]`);
                            await client.query('UPDATE GoodsReceiptItems SET ProductID = $1 WHERE ProductID = $2', [keep.pid, old.pid]);
                        }

                        // ─── Reassign BuyingPrices ───
                        const bp = await client.query('SELECT COUNT(*) as cnt FROM BuyingPrices WHERE ProductID = $1', [old.pid]);
                        if (parseInt(bp.rows[0].cnt) > 0) {
                            console.log(`  Reassigning ${bp.rows[0].cnt} BuyingPrices → [${keep.pid}]`);
                            await client.query('UPDATE BuyingPrices SET ProductID = $1 WHERE ProductID = $2', [keep.pid, old.pid]);
                        }

                        // ─── Reassign CustomerProductPrices ───
                        const cpp = await client.query('SELECT COUNT(*) as cnt FROM CustomerProductPrices WHERE ProductID = $1', [old.pid]);
                        if (parseInt(cpp.rows[0].cnt) > 0) {
                            console.log(`  Reassigning ${cpp.rows[0].cnt} CustomerProductPrices → [${keep.pid}]`);
                            await client.query('UPDATE CustomerProductPrices SET ProductID = $1 WHERE ProductID = $2', [keep.pid, old.pid]);
                        }

                        // ─── Reassign PriceListItems ───
                        const pli = await client.query('SELECT COUNT(*) as cnt FROM PriceListItems WHERE ProductID = $1', [old.pid]);
                        if (parseInt(pli.rows[0].cnt) > 0) {
                            console.log(`  Reassigning ${pli.rows[0].cnt} PriceListItems → [${keep.pid}]`);
                            await client.query('UPDATE PriceListItems SET ProductID = $1 WHERE ProductID = $2', [keep.pid, old.pid]);
                        }

                        // ─── Delete old inventory ───
                        await client.query('DELETE FROM Inventory WHERE ProductID = $1', [old.pid]);

                        // ─── Deactivate old product ───
                        await client.query(
                            'UPDATE Products SET IsActive = false, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $1',
                            [old.pid]
                        );

                        // Get final kept quantity
                        const finalInv = await client.query(
                            `SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1`, [keep.pid]
                        );
                        const finalQty = finalInv.rows.length > 0 ? parseFloat(finalInv.rows[0].quantityonhand || 0) : 0;

                        console.log(`  ✅ Done. Final kept qty: ${finalQty}\n`);

                        results.push({
                            group: groupNum,
                            family: keep.family,
                            keptName: keep.name,
                            keptId: keep.pid,
                            oldName: old.name,
                            oldId: old.pid,
                            finalQty: finalQty,
                            qtyAdded: qtyAdjustment,
                            salesReassigned: oldSalesCount,
                            purchasesReassigned: oldPurchasesCount
                        });
                    } catch (innerErr) {
                        errorCount++;
                        console.error(`  ❌ Error on [${old.pid}]: ${innerErr.message}\n`);
                        results.push({
                            group: groupNum,
                            family: keep.family,
                            keptName: keep.name,
                            keptId: keep.pid,
                            oldName: old.name,
                            oldId: old.pid,
                            finalQty: 'ERROR',
                            qtyAdded: 0,
                            salesReassigned: 0,
                            purchasesReassigned: 0,
                            error: innerErr.message
                        });
                    }
                }
            }
        }

        if (errorCount === 0) {
            await client.query('COMMIT');
            console.log(`\n✅ COMMITTED — ${processedCount} products deactivated across ${groupMap.size} groups.`);
        } else {
            await client.query('ROLLBACK');
            console.log(`\n❌ ROLLED BACK — ${errorCount} errors encountered. Fix and re-run.`);
        }

        // Refresh mv_Catalogue
        if (errorCount === 0) {
            console.log('\n--- Refreshing mv_Catalogue ---');
            await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('✅ mv_Catalogue refreshed');
        }

        // Generate results CSV
        let csv = 'Group #,Category/Family,Kept Product Name,Kept Product ID,Old Product Name,Old Product ID,Final Quantity,Qty Added from Old,Sales Reassigned,Purchases Reassigned\n';
        for (const r of results) {
            csv += `"${r.group}","${r.family}","${r.keptName.replace(/"/g, '""')}","${r.keptId}","${r.oldName.replace(/"/g, '""')}","${r.oldId}","${r.finalQty}","${r.qtyAdded}","${r.salesReassigned}","${r.purchasesReassigned}"\n`;
        }

        const outputPath = path.resolve(__dirname, '..', '..', 'deep_cleanup_results.csv');
        fs.writeFileSync(outputPath, csv);
        console.log(`\n✅ Results CSV saved to: ${outputPath}`);

        // Verification
        const remaining = await cloudPool.query(`
            SELECT ProductName, COUNT(*) as cnt
            FROM Products WHERE IsActive = true
            GROUP BY ProductName HAVING COUNT(*) > 1
        `);
        if (remaining.rows.length === 0) {
            console.log('✅ No exact-name duplicates remain among active products!');
        } else {
            console.log(`⚠️ ${remaining.rows.length} exact-name duplicates still remain:`);
            remaining.rows.slice(0, 10).forEach(r => console.log(`  "${r.productname}" x${r.cnt}`));
        }

        console.log(`\n✅✅✅ DEEP CLEANUP COMPLETE! Processed: ${processedCount}, Errors: ${errorCount} ✅✅✅`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ FATAL ERROR — rolled back:', err.message, err.stack);
    } finally {
        client.release();
        cloudPool.end();
    }
}

cleanupAllDuplicates();

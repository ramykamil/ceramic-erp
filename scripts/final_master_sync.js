const pool = require('../backend/src/config/database');

// Configuration
const START_DATE = '2026-04-06';
const DRY_RUN = false; 

async function finalMasterSync() {
    console.log(`[FinalSync] Starting definitive synchronization...`);
    console.log(`[FinalSync] Logic: Purchases - Sales + Sync_Update_Baseline (starting from ${START_DATE})`);
    
    const client = await pool.connect();
    
    try {
        // 1. Identify all products with the "Sync update" baseline
        const baselines = await client.query(`
            SELECT it.ProductID, it.WarehouseID, p.ProductName, it.Quantity as BaselineQty, it.CreatedAt as BaselineDate
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            WHERE it.Notes = 'Sync update'
              AND it.CreatedAt >= '2026-04-07 00:00:00'
              AND it.CreatedAt < '2026-04-07 06:00:00'
        `);

        console.log(`[FinalSync] Found ${baselines.rows.length} products to synchronize.`);

        let appliedCount = 0;
        let totalQtyChange = 0;

        for (const base of baselines.rows) {
            const { productid, warehouseid, productname, baselineqty } = base;

            // Step B: Sum Sales (Confirmed+) since April 6
            const salesResult = await client.query(`
                SELECT SUM(oi.Quantity) as total_sold
                FROM OrderItems oi
                JOIN Orders o ON oi.OrderID = o.OrderID
                WHERE oi.ProductID = $1
                  AND o.WarehouseID = $2
                  AND o.Status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
                  AND o.OrderDate >= $3
            `, [productid, warehouseid, START_DATE]);

            // Step C: Sum Purchases (Received) since April 6
            const purchaseResult = await client.query(`
                SELECT SUM(gri.QuantityReceived) as total_purchased
                FROM GoodsReceiptItems gri
                JOIN GoodsReceipts gr ON gri.ReceiptID = gr.ReceiptID
                WHERE gri.ProductID = $1
                  AND gr.WarehouseID = $2
                  AND gr.Status = 'RECEIVED'
                  AND gr.ReceiptDate >= $3
            `, [productid, warehouseid, START_DATE]);

            const totalSold = parseFloat(salesResult.rows[0].total_sold) || 0;
            const totalPurchased = parseFloat(purchaseResult.rows[0].total_purchased) || 0;
            const baseline = parseFloat(baselineqty);

            // FINAL FORMULA: Purchases - Sales + Baseline
            const targetQty = totalPurchased - totalSold + baseline;

            // Get current quantity to log the shift
            const currentRes = await client.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = \'OWNED\'', [productid, warehouseid]);
            const currentQty = currentRes.rows.length > 0 ? parseFloat(currentRes.rows[0].quantityonhand) : 0;

            if (Math.abs(targetQty - currentQty) > 0.001) {
                console.log(`[FinalSync] Correcting: ${productname}`);
                console.log(`  - Baseline: ${baseline}`);
                console.log(`  - Total Sold (since Apr 6): ${totalSold}`);
                console.log(`  - Total Purchased (since Apr 6): ${totalPurchased}`);
                console.log(`  - NEW TARGET: ${targetQty.toFixed(2)} (Was: ${currentQty.toFixed(2)})`);

                if (!DRY_RUN) {
                    await client.query('BEGIN');
                    try {
                        // Update inventory
                        await client.query(`
                            UPDATE Inventory SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP
                            WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
                        `, [targetQty, productid, warehouseid]);

                        // Recalculate Pallet/Colis
                        const pkg = await client.query('SELECT QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1', [productid]);
                        if (pkg.rows.length > 0) {
                            const ppc = parseFloat(pkg.rows[0].qteparcolis) || 0;
                            const cpp = parseFloat(pkg.rows[0].qtecolisparpalette) || 0;
                            const newColis = ppc > 0 ? parseFloat((targetQty / ppc).toFixed(4)) : 0;
                            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
                            await client.query(
                                'UPDATE Inventory SET ColisCount = $1, PalletCount = $2 WHERE ProductID = $3 AND WarehouseID = $4 AND OwnershipType = \'OWNED\'',
                                [newColis, newPallets, productid, warehouseid]
                            );
                        }

                        // Record Audit
                        await client.query(`
                            INSERT INTO InventoryTransactions 
                            (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, CreatedAt)
                            VALUES ($1, $2, 'ADJUSTMENT', $3, 'FINAL_SYNC', $4, 1, CURRENT_TIMESTAMP)
                        `, [productid, warehouseid, targetQty - currentQty, `Corrected System Logic: Baseline (${baseline}) - Sales (${totalSold}) + Purchases (${totalPurchased})`]);

                        await client.query('COMMIT');
                        appliedCount++;
                        totalQtyChange += (targetQty - currentQty);
                    } catch (err) {
                        await client.query('ROLLBACK');
                        console.error(`[Error] ${productname}:`, err.message);
                    }
                }
            } else {
                console.log(`[FinalSync] Skipping: ${productname} (Already correct at ${targetQty.toFixed(2)})`);
            }
        }

        console.log(`\n[FinalSync Summary]`);
        console.log(`- Products Fixed: ${appliedCount}`);
        console.log(`- Total Stock Shift: ${totalQtyChange.toFixed(2)}`);

        if (!DRY_RUN && appliedCount > 0) {
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        }
        console.log(`[FinalSync] Completed.`);

    } catch (error) {
        console.error('[Fatal]', error);
    } finally {
        client.release();
        await pool.end();
    }
}

finalMasterSync();

const pool = require('../backend/src/config/database');

// Configuration
const START_DATE = '2026-04-06';
const DRY_RUN = false; // Set to true for Audit mode

async function masterSync() {
    console.log(`[MasterSync] Starting synchronization based on user formula...`);
    console.log(`[MasterSync] Start Date: ${START_DATE} | Dry Run: ${DRY_RUN}`);
    
    const client = await pool.connect();
    
    try {
        // 1. Get all products that have inventory records
        const products = await client.query(`
            SELECT i.ProductID, i.WarehouseID, p.ProductName, i.QuantityOnHand as CurrentQty
            FROM Inventory i
            JOIN Products p ON i.ProductID = p.ProductID
            WHERE i.OwnershipType = 'OWNED'
        `);

        console.log(`[MasterSync] Auditing ${products.rows.length} inventory records...`);
        let appliedCount = 0;
        let totalQtyChange = 0;

        for (const inv of products.rows) {
            const { productid, warehouseid, productname, currentqty } = inv;

            // Step A: Find the LAST manual adjustment (ignoring system sync ones)
            const lastAdjResult = await client.query(`
                SELECT QuantityOnHand, CreatedAt
                FROM InventoryTransactions
                WHERE ProductID = $1 
                  AND WarehouseID = $2 
                  AND TransactionType = 'ADJUSTMENT'
                  AND ReferenceType NOT IN ('SYNC_REVERSAL', 'SYNC_CORRECTION')
                  AND Notes NOT LIKE 'Sync %'
                  AND Notes NOT LIKE 'Correction Sync %'
                ORDER BY CreatedAt DESC
                LIMIT 1
            `, [productid, warehouseid]);

            if (lastAdjResult.rows.length === 0) {
                // No manual adjustment baseline found for this product. 
                // We'll skip it to avoid guessing the baseline.
                continue;
            }

            const baselineQty = parseFloat(lastAdjResult.rows[0].quantityonhand) || 0;
            const baselineDate = lastAdjResult.rows[0].createdat;

            // Step B: Sum Sales (Confirmed/Processing/Shipped/Delivered) since April 6
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

            // Apply Formula: Baseline - Sales + Purchases
            const targetQty = baselineQty - totalSold + totalPurchased;

            if (Math.abs(targetQty - parseFloat(currentqty)) > 0.001) {
                console.log(`[MasterSync] Product: ${productname}`);
                console.log(`  - Baseline (Adj at ${baselineDate}): ${baselineQty}`);
                console.log(`  - Total Sold (Since Apr 6): ${totalSold}`);
                console.log(`  - Total Purchased (Since Apr 6): ${totalPurchased}`);
                console.log(`  - NEW CALCULATED: ${targetQty} (Current: ${currentqty})`);

                if (!DRY_RUN) {
                    await client.query('BEGIN');
                    try {
                        // Update Inventory
                        await client.query(`
                            UPDATE Inventory 
                            SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP
                            WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
                        `, [targetQty, productid, warehouseid]);

                        // Recalculate Pallet/Colis
                        const productPkg = await client.query('SELECT QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1', [productid]);
                        if (productPkg.rows.length > 0) {
                           const ppc = parseFloat(productPkg.rows[0].qteparcolis) || 0;
                           const cpp = parseFloat(productPkg.rows[0].qtecolisparpalette) || 0;
                           const newColis = ppc > 0 ? parseFloat((targetQty / ppc).toFixed(4)) : 0;
                           const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
                           await client.query(`
                               UPDATE Inventory SET ColisCount = $1, PalletCount = $2 
                               WHERE ProductID = $3 AND WarehouseID = $4 AND OwnershipType = 'OWNED'
                           `, [newColis, newPallets, productid, warehouseid]);
                        }

                        // Record Audit Adjustment
                        await client.query(`
                            INSERT INTO InventoryTransactions 
                            (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, CreatedAt, QuantityOnHand)
                            VALUES ($1, $2, 'ADJUSTMENT', $3, 'MASTER_SYNC', $4, 1, CURRENT_TIMESTAMP, $5)
                        `, [productid, warehouseid, targetQty - currentqty, `Master Sync: Baseline ${baselineQty} - Sales ${totalSold} + Purchases ${totalPurchased}`, targetQty]);

                        await client.query('COMMIT');
                        appliedCount++;
                        totalQtyChange += (targetQty - currentqty);
                    } catch (err) {
                        await client.query('ROLLBACK');
                        console.error(`[MasterSync] Failed to update ${productname}:`, err.message);
                    }
                }
            }
        }

        console.log(`\n[MasterSync Summary]`);
        console.log(`- Products Adjusted: ${appliedCount}`);
        console.log(`- Total Quantity Shift: ${totalQtyChange.toFixed(2)}`);

        if (!DRY_RUN && appliedCount > 0) {
            console.log(`[MasterSync] Refreshing materialized view...`);
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        }
        console.log(`[MasterSync] Process complete.`);

    } catch (error) {
        console.error('[MasterSync] Fatal error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

masterSync();

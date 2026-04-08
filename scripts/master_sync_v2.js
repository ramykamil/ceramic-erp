const pool = require('../backend/src/config/database');

// Configuration
const START_DATE = '2026-04-06';
const DRY_RUN = false;

async function masterSyncV2() {
    console.log(`[MasterSyncV2] Starting synchronization...`);
    console.log(`[MasterSyncV2] Logic: (Last Human Adj) - (Sales since Apr 6) + (Purchases since Apr 6)`);
    
    const client = await pool.connect();
    
    try {
        // 1. Get all inventory records
        const invRecords = await client.query(`
            SELECT i.ProductID, i.WarehouseID, p.ProductName, i.QuantityOnHand as CurrentQty
            FROM Inventory i
            JOIN Products p ON i.ProductID = p.ProductID
            WHERE i.OwnershipType = 'OWNED'
        `);

        console.log(`[MasterSyncV2] Auditing ${invRecords.rows.length} records...`);
        let appliedCount = 0;
        let totalQtyChange = 0;

        for (const inv of invRecords.rows) {
            const { productid, warehouseid, productname } = inv;

            // Step A: Find the LAST manual/human adjustment
            const lastAdjResult = await client.query(`
                SELECT Notes, Quantity, CreatedAt
                FROM InventoryTransactions
                WHERE ProductID = $1 
                  AND WarehouseID = $2 
                  AND TransactionType = 'ADJUSTMENT'
                  AND Notes NOT LIKE 'Sync %'
                  AND Notes NOT LIKE 'Correction Sync %'
                  AND Notes NOT LIKE 'Final Inventory %'
                  AND Notes NOT LIKE 'Correction Sync: %'
                ORDER BY CreatedAt DESC
                LIMIT 1
            `, [productid, warehouseid]);

            if (lastAdjResult.rows.length === 0) continue;

            const note = lastAdjResult.rows[0].notes || '';
            let baselineQty = 0;
            let foundBaseline = false;

            // Robust parsing of "Old → New" from the note
            // Pattern example: "Ajustement manuel via catalogue: 0,00 → 622,08"
            // or "3 030,21 → 3 302,37"
            const match = note.match(/→\s*([\d\s,.]+)/);
            if (match) {
                // Found the final target in the note
                // Clean the number format (French/Space for thousands, comma for decimal)
                let s = match[1].replace(/[\s\u00A0]/g, '').replace(',', '.');
                baselineQty = parseFloat(s);
                foundBaseline = true;
            } else {
                // Fallback: If no arrow, maybe the 'Quantity' field was the absolute?
                // But we know it's a delta. So without the arrow note, we can't reliably know the baseline.
                // However, many manual adjustments use the format with the arrow.
                continue; 
            }

            if (!foundBaseline || isNaN(baselineQty)) continue;

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

            // MASTER FORMULA
            const targetQty = baselineQty - totalSold + totalPurchased;

            if (Math.abs(targetQty - parseFloat(inv.currentqty)) > 0.001) {
                console.log(`[MasterSyncV2] Fixed: ${productname}`);
                console.log(`  - Human Baseline: ${baselineQty} (from: "${note}")`);
                console.log(`  - Sales since Apr 6: ${totalSold}`);
                console.log(`  - Purchases since Apr 6: ${totalPurchased}`);
                console.log(`  - FINAL: ${targetQty.toFixed(2)} (Was: ${inv.currentqty})`);

                if (!DRY_RUN) {
                    await client.query('BEGIN');
                    try {
                        await client.query(`
                            UPDATE Inventory SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP
                            WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
                        `, [targetQty, productid, warehouseid]);

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

                        await client.query(`
                            INSERT INTO InventoryTransactions 
                            (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, CreatedAt)
                            VALUES ($1, $2, 'ADJUSTMENT', $3, 'MASTER_SYNC_V2', $4, 1, CURRENT_TIMESTAMP)
                        `, [productid, warehouseid, targetQty - parseFloat(inv.currentqty), `Final Re-Sync: Baseline ${baselineQty} - Sales ${totalSold} + Purchases ${totalPurchased}`]);

                        await client.query('COMMIT');
                        appliedCount++;
                        totalQtyChange += (targetQty - parseFloat(inv.currentqty));
                    } catch (err) {
                        await client.query('ROLLBACK');
                        console.error(`[Error] ${productname}:`, err.message);
                    }
                }
            }
        }

        console.log(`\n[MasterSyncV2 Summary]`);
        console.log(`- Products Synchronized: ${appliedCount}`);
        console.log(`- Total Stock Shift: ${totalQtyChange.toFixed(2)}`);

        if (!DRY_RUN && appliedCount > 0) {
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        }
        console.log(`[MasterSyncV2] Completed.`);

    } catch (error) {
        console.error('[Fatal]', error);
    } finally {
        client.release();
        await pool.end();
    }
}

masterSyncV2();

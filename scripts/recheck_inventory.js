const pool = require('../backend/src/config/database');

const DRY_RUN = false; 

async function recheckInventory() {
    console.log(`[Recheck] Analyzing potential double-deductions... (Dry Run: ${DRY_RUN})`);
    
    const client = await pool.connect();
    
    try {
        // 1. Find all 'Sync Filtered Vente' transactions created by the previous script
        const syncTrans = await client.query(`
            SELECT 
                it.TransactionID, it.ProductID, it.WarehouseID, it.Quantity, it.ReferenceID as OrderID,
                it.CreatedAt as SyncDate,
                o.OrderNumber, o.OrderDate
            FROM InventoryTransactions it
            JOIN Orders o ON it.ReferenceID = o.OrderID
            WHERE it.Notes LIKE 'Sync Filtered Vente%'
              AND it.TransactionType = 'OUT'
            ORDER BY it.CreatedAt DESC
        `);

        console.log(`[Recheck] Analying ${syncTrans.rows.length} automated deductions.`);

        let reversalsCount = 0;
        let totalQtyRestored = 0;

        for (const trans of syncTrans.rows) {
            // Find the MOST RECENT manual adjustment for this product/warehouse that happened AFTER the Order
            // but BEFORE the Sync script.
            const adjustmentCheck = await client.query(`
                SELECT TransactionID, CreatedAt, Quantity, Notes
                FROM InventoryTransactions
                WHERE ProductID = $1 
                  AND WarehouseID = $2 
                  AND TransactionType = 'ADJUSTMENT'
                  AND CreatedAt > $3
                  AND CreatedAt < $4
                ORDER BY CreatedAt DESC
                LIMIT 1
            `, [trans.productid, trans.warehouseid, trans.orderdate, trans.syncdate]);

            if (adjustmentCheck.rows.length > 0) {
                const adj = adjustmentCheck.rows[0];
                console.log(`[Recheck] Conflict found for Order #${trans.ordernumber}:`);
                console.log(`  - Order Date: ${trans.orderdate}`);
                console.log(`  - Manual Adjustment on: ${adj.createdat} (Note: ${adj.notes})`);
                console.log(`  - Redundant Deduction of ${trans.quantity} should be reversed.`);

                if (DRY_RUN) continue;

                await client.query('BEGIN');
                try {
                    const qtyToRestore = parseFloat(trans.quantity);

                    // 1. Add back to Inventory
                    const updateResult = await client.query(`
                        UPDATE Inventory 
                        SET QuantityOnHand = QuantityOnHand + $1,
                            UpdatedAt = CURRENT_TIMESTAMP
                        WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
                        RETURNING QuantityOnHand
                    `, [qtyToRestore, trans.productid, trans.warehouseid]);

                    if (updateResult.rows.length > 0) {
                        const newQty = parseFloat(updateResult.rows[0].quantityonhand);
                        
                        // 2. Recalculate Pallet/Colis counts
                        const productPkg = await client.query('SELECT QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1', [trans.productid]);
                        if (productPkg.rows.length > 0) {
                            const ppc = parseFloat(productPkg.rows[0].qteparcolis) || 0;
                            const cpp = parseFloat(productPkg.rows[0].qtecolisparpalette) || 0;
                            const newColis = ppc > 0 ? parseFloat((newQty / ppc).toFixed(4)) : 0;
                            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
                            
                            await client.query(`
                                UPDATE Inventory SET ColisCount = $1, PalletCount = $2 
                                WHERE ProductID = $3 AND WarehouseID = $4 AND OwnershipType = 'OWNED'
                            `, [newColis, newPallets, trans.productid, trans.warehouseid]);
                        }

                        // 3. Mark the sync transaction as reversed in its notes
                        await client.query(`
                            UPDATE InventoryTransactions 
                            SET Notes = Notes || ' [REVERSED: Manual adjustment already accounted for this sale]'
                            WHERE TransactionID = $1
                        `, [trans.transactionid]);

                        // 4. Record the reversal transaction
                        await client.query(`
                            INSERT INTO InventoryTransactions 
                            (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes, CreatedBy, CreatedAt)
                            VALUES ($1, $2, 'ADJUSTMENT', $3, 'SYNC_REVERSAL', $4, $5, 1, CURRENT_TIMESTAMP)
                        `, [trans.productid, trans.warehouseid, qtyToRestore, trans.orderid, `Correction Sync: Restitution stock car déjà ajusté manuellement (Order #${trans.ordernumber})`]);
                    }

                    await client.query('COMMIT');
                    reversalsCount++;
                    totalQtyRestored += qtyToRestore;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`[Recheck] Failed to reverse Order #${trans.ordernumber}:`, err.message);
                }
            }
        }

        console.log(`\n[Recheck Summary]`);
        console.log(`- Redundant Deductions Reversed: ${reversalsCount}`);
        console.log(`- Total Quantity Restored: ${totalQtyRestored.toFixed(2)}`);

        if (reversalsCount > 0) {
            console.log(`[Recheck] Refreshing materialized view...`);
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        }
        console.log(`[Recheck] Process complete.`);
        
    } catch (error) {
        console.error('[Recheck] Fatal error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

recheckInventory();

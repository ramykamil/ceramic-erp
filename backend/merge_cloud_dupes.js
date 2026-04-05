const { Pool } = require('pg');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

// Duplicate pairs: [oldId (deactivate), newId (keep)]
const duplicates = [
    { oldId: 3702, newId: 3717, name: 'FICHE:FLORA SILVER 30/90' },
    { oldId: 3692, newId: 3714, name: 'FICHE:KING CREMA 45/90' },
    { oldId: 3698, newId: 3716, name: 'FICHE:ROMA GRIS 25/75' },
    { oldId: 3703, newId: 3712, name: 'FICHE:SOFT BEIGE 60/60' },
    { oldId: 3695, newId: 3713, name: 'FICHE:VENAS PLUS 60/60' },
    { oldId: 3719, newId: 3852, name: 'KING IVORY RELIEFE 45/90' },
    { oldId: 3697, newId: 3711, name: 'MOTIF ROMA GRIS 25/75' },
    { oldId: 3693, newId: 3706, name: 'VENAS PLUS 60/60' },
];

async function mergeDuplicates() {
    const client = await cloudPool.connect();
    try {
        await client.query('BEGIN');

        for (const dup of duplicates) {
            console.log(`\n--- Merging "${dup.name}" [${dup.oldId}] → [${dup.newId}] ---`);

            // 1. Merge inventory: add old quantities to new
            const oldInv = await client.query('SELECT QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1', [dup.oldId]);
            const newInv = await client.query('SELECT InventoryID, QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1', [dup.newId]);

            if (oldInv.rows.length > 0 && newInv.rows.length > 0) {
                const oldQty = parseFloat(oldInv.rows[0].quantityonhand || 0);
                const oldPal = parseFloat(oldInv.rows[0].palletcount || 0);
                const oldCol = parseFloat(oldInv.rows[0].coliscount || 0);
                const newQty = parseFloat(newInv.rows[0].quantityonhand || 0);
                const newPal = parseFloat(newInv.rows[0].palletcount || 0);
                const newCol = parseFloat(newInv.rows[0].coliscount || 0);

                const mergedQty = newQty + oldQty;
                const mergedPal = newPal + oldPal;
                const mergedCol = newCol + oldCol;

                console.log(`  Inventory: ${newQty} + ${oldQty} = ${mergedQty}`);
                await client.query(
                    'UPDATE Inventory SET QuantityOnHand = $1, PalletCount = $2, ColisCount = $3 WHERE InventoryID = $4',
                    [mergedQty, mergedPal, mergedCol, newInv.rows[0].inventoryid]
                );
            }

            // 2. Re-point OrderItems from old → new
            const orderItems = await client.query('SELECT COUNT(*) as cnt FROM OrderItems WHERE ProductID = $1', [dup.oldId]);
            const oiCount = parseInt(orderItems.rows[0].cnt);
            if (oiCount > 0) {
                console.log(`  Reassigning ${oiCount} OrderItems → [${dup.newId}]`);
                await client.query('UPDATE OrderItems SET ProductID = $1 WHERE ProductID = $2', [dup.newId, dup.oldId]);
            }

            // 3. Re-point PurchaseOrderItems from old → new
            const poItems = await client.query('SELECT COUNT(*) as cnt FROM PurchaseOrderItems WHERE ProductID = $1', [dup.oldId]);
            const poCount = parseInt(poItems.rows[0].cnt);
            if (poCount > 0) {
                console.log(`  Reassigning ${poCount} PurchaseOrderItems → [${dup.newId}]`);
                await client.query('UPDATE PurchaseOrderItems SET ProductID = $1 WHERE ProductID = $2', [dup.newId, dup.oldId]);
            }

            // 4. Re-point InventoryTransactions from old → new
            const invTx = await client.query('SELECT COUNT(*) as cnt FROM InventoryTransactions WHERE ProductID = $1', [dup.oldId]);
            const txCount = parseInt(invTx.rows[0].cnt);
            if (txCount > 0) {
                console.log(`  Reassigning ${txCount} InventoryTransactions → [${dup.newId}]`);
                await client.query('UPDATE InventoryTransactions SET ProductID = $1 WHERE ProductID = $2', [dup.newId, dup.oldId]);
            }

            // 5. Delete old inventory records
            await client.query('DELETE FROM Inventory WHERE ProductID = $1', [dup.oldId]);

            // 6. Deactivate the old product
            await client.query('UPDATE Products SET IsActive = false, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $1', [dup.oldId]);
            console.log(`  ✅ [${dup.oldId}] deactivated, all references moved to [${dup.newId}]`);
        }

        await client.query('COMMIT');

        // Refresh mv_Catalogue
        console.log('\n--- Refreshing mv_Catalogue ---');
        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed');

        // Verification
        console.log('\n=== VERIFICATION ===');
        const remaining = await cloudPool.query(`
      SELECT ProductName, COUNT(*) as cnt
      FROM Products WHERE IsActive = true
      GROUP BY ProductName HAVING COUNT(*) > 1
    `);
        if (remaining.rows.length === 0) {
            console.log('✅ No more duplicates!');
        } else {
            console.log(`⚠️ ${remaining.rows.length} duplicates still remain:`);
            remaining.rows.forEach(r => console.log(`  "${r.productname}" x${r.cnt}`));
        }

        const finalCount = await cloudPool.query(`SELECT COUNT(*) FROM mv_Catalogue`);
        console.log(`\nFinal mv_Catalogue count: ${finalCount.rows[0].count}`);
        console.log('\n✅✅✅ DUPLICATE MERGE COMPLETE! ✅✅✅');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ ERROR — rolled back:', err.message, err.stack);
    } finally {
        client.release();
        cloudPool.end();
    }
}

mergeDuplicates();

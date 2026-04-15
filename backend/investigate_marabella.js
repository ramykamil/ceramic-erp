const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function findAffectedProducts() {
    const client = await pool.connect();
    try {
        console.log('=================================================================');
        console.log('  FULL AUDIT: Finding all PURCHASE_UPDATE phantom transactions');
        console.log('=================================================================\n');

        // 1. Find ALL PURCHASE_UPDATE inventory transactions
        console.log('--- Step 1: All PURCHASE_UPDATE transactions ---\n');
        const allPurchaseUpdates = await client.query(`
            SELECT 
                it.TransactionID, it.ProductID, it.TransactionType, it.Quantity, 
                it.ReferenceID as po_id, it.CreatedAt, it.WarehouseID,
                p.ProductName, p.ProductCode, p.QteParColis, p.QteColisParPalette,
                u.Username,
                w.WarehouseName
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            LEFT JOIN Users u ON it.CreatedBy = u.UserID
            LEFT JOIN Warehouses w ON it.WarehouseID = w.WarehouseID
            WHERE it.ReferenceType = 'PURCHASE_UPDATE'
            ORDER BY it.CreatedAt ASC
        `);

        console.log(`Found ${allPurchaseUpdates.rows.length} PURCHASE_UPDATE transactions total.\n`);

        // 2. For each, check if the referenced PO still exists
        const orphanedTransactions = [];
        const validTransactions = [];

        for (const tx of allPurchaseUpdates.rows) {
            const poCheck = await client.query(
                'SELECT PurchaseOrderID, PONumber, Status FROM PurchaseOrders WHERE PurchaseOrderID = $1',
                [tx.po_id]
            );
            
            if (poCheck.rows.length === 0) {
                orphanedTransactions.push(tx);
            } else {
                validTransactions.push({ ...tx, poNumber: poCheck.rows[0].ponumber, poStatus: poCheck.rows[0].status });
            }
        }

        console.log(`  Orphaned (PO deleted): ${orphanedTransactions.length}`);
        console.log(`  Valid (PO exists):     ${validTransactions.length}\n`);

        // 3. Show orphaned transactions
        if (orphanedTransactions.length > 0) {
            console.log('=================================================================');
            console.log('  ORPHANED PURCHASE_UPDATE TRANSACTIONS (PO deleted!)');
            console.log('=================================================================\n');
            
            for (const tx of orphanedTransactions) {
                console.log(`  TX#${tx.transactionid} | ${tx.createdat}`);
                console.log(`    Product: ${tx.productname} (ID: ${tx.productid})`);
                console.log(`    Type: ${tx.transactiontype} | Qty: ${tx.quantity}`);
                console.log(`    Ref PO ID: ${tx.po_id} (DELETED!)`);
                console.log(`    By: ${tx.username} | WH: ${tx.warehousename}`);
                console.log('');
            }
        }

        // 4. Now check for DOUBLE-COUNTING: products where PURCHASE_UPDATE added stock
        //    AND Goods Receipt also added stock for the same PO
        console.log('=================================================================');
        console.log('  DOUBLE-COUNT CHECK: PURCHASE_UPDATE + GOODS_RECEIPT for same PO');
        console.log('=================================================================\n');

        // Group PURCHASE_UPDATE IN transactions by product and PO
        const purchaseUpdateINs = allPurchaseUpdates.rows.filter(t => t.transactiontype === 'IN');
        
        const doubleCountedProducts = new Map();

        for (const puTx of purchaseUpdateINs) {
            // Check if there's ALSO a GOODS_RECEIPT IN for the same product around the same time
            const grTransactions = await client.query(`
                SELECT it.TransactionID, it.Quantity, it.ReferenceID, it.CreatedAt, it.ReferenceType
                FROM InventoryTransactions it
                WHERE it.ProductID = $1
                  AND it.TransactionType = 'IN'
                  AND it.ReferenceType = 'GOODS_RECEIPT'
                  AND it.TransactionID != $2
            `, [puTx.productid, puTx.transactionid]);

            if (grTransactions.rows.length > 0) {
                if (!doubleCountedProducts.has(puTx.productid)) {
                    doubleCountedProducts.set(puTx.productid, {
                        product: puTx,
                        purchaseUpdateTx: [],
                        goodsReceiptTx: []
                    });
                }
                doubleCountedProducts.get(puTx.productid).purchaseUpdateTx.push(puTx);
                doubleCountedProducts.get(puTx.productid).goodsReceiptTx = grTransactions.rows;
            }
        }

        // 5. For each potentially double-counted product, do full analysis
        console.log(`Found ${doubleCountedProducts.size} products with both PURCHASE_UPDATE and GOODS_RECEIPT entries.\n`);

        const affectedProducts = [];

        for (const [productId, data] of doubleCountedProducts) {
            const product = data.product;
            
            // Get current inventory
            const inv = await client.query(`
                SELECT SUM(QuantityOnHand) as totalqty, SUM(PalletCount) as totalpal, SUM(ColisCount) as totalcol
                FROM Inventory WHERE ProductID = $1
            `, [productId]);
            const currentQty = parseFloat(inv.rows[0]?.totalqty || 0);

            // Get ALL transactions to compute expected qty
            const allTx = await client.query(`
                SELECT TransactionType, Quantity, ReferenceType, ReferenceID
                FROM InventoryTransactions WHERE ProductID = $1
                ORDER BY CreatedAt ASC
            `, [productId]);

            let computedQty = 0;
            for (const t of allTx.rows) {
                const qty = parseFloat(t.quantity || 0);
                if (t.transactiontype === 'IN') computedQty += qty;
                else if (t.transactiontype === 'OUT') computedQty -= qty;
                else if (t.transactiontype === 'ADJUSTMENT') computedQty += qty;
            }

            // Count POs for this product
            const poCount = await client.query(`
                SELECT COUNT(DISTINCT po.PurchaseOrderID) as cnt, 
                       SUM(poi.Quantity) as total_purchased
                FROM PurchaseOrderItems poi
                JOIN PurchaseOrders po ON poi.PurchaseOrderID = po.PurchaseOrderID
                WHERE poi.ProductID = $1
            `, [productId]);

            // Get total PURCHASE_UPDATE IN qty
            const puInTotal = data.purchaseUpdateTx.reduce((s, t) => s + parseFloat(t.quantity || 0), 0);
            // Get total GR IN qty  
            const grInTotal = data.goodsReceiptTx.reduce((s, t) => s + parseFloat(t.quantity || 0), 0);

            // Check for orphaned PU transactions
            const orphanedPUForProduct = data.purchaseUpdateTx.filter(t => 
                orphanedTransactions.some(o => o.transactionid === t.transactionid)
            );
            const orphanedQty = orphanedPUForProduct.reduce((s, t) => s + parseFloat(t.quantity || 0), 0);

            const isAffected = orphanedQty > 0;

            if (isAffected) {
                affectedProducts.push({
                    productId,
                    productName: product.productname,
                    currentQty,
                    computedFromTx: computedQty,
                    purchaseUpdateInQty: puInTotal,
                    goodsReceiptInQty: grInTotal,
                    orphanedQty,
                    poCount: parseInt(poCount.rows[0]?.cnt || 0),
                    totalPurchased: parseFloat(poCount.rows[0]?.total_purchased || 0),
                    ppc: parseFloat(product.qteparcolis || 0),
                    cpp: parseFloat(product.qtecolisparpalette || 0),
                    orphanedTransactions: orphanedPUForProduct
                });
            }
        }

        // 6. Also check for products with ONLY orphaned PURCHASE_UPDATE (no GR at all)
        const orphanedProductIds = [...new Set(orphanedTransactions.map(t => t.productid))];
        for (const pid of orphanedProductIds) {
            if (!affectedProducts.some(a => a.productId === pid)) {
                const orphanedForProd = orphanedTransactions.filter(t => t.productid === pid);
                const orphanedQty = orphanedForProd.reduce((s, t) => {
                    if (t.transactiontype === 'IN') return s + parseFloat(t.quantity || 0);
                    if (t.transactiontype === 'OUT') return s - parseFloat(t.quantity || 0);
                    return s;
                }, 0);

                const inv = await client.query('SELECT SUM(QuantityOnHand) as totalqty FROM Inventory WHERE ProductID = $1', [pid]);
                const currentQty = parseFloat(inv.rows[0]?.totalqty || 0);

                const pInfo = await client.query('SELECT ProductName, QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1', [pid]);

                affectedProducts.push({
                    productId: pid,
                    productName: pInfo.rows[0]?.productname || 'Unknown',
                    currentQty,
                    orphanedQty,
                    ppc: parseFloat(pInfo.rows[0]?.qteparcolis || 0),
                    cpp: parseFloat(pInfo.rows[0]?.qtecolisparpalette || 0),
                    orphanedTransactions: orphanedForProd
                });
            }
        }

        // 7. Print full report
        console.log('=================================================================');
        console.log('           AFFECTED PRODUCTS REPORT');
        console.log('=================================================================\n');

        if (affectedProducts.length === 0) {
            console.log('  No affected products found! Only MARABELLA was impacted.\n');
        } else {
            console.log(`  Found ${affectedProducts.length} affected product(s):\n`);
            
            for (const ap of affectedProducts) {
                const correctedQty = ap.currentQty - ap.orphanedQty;
                const currentPal = ap.cpp > 0 && ap.ppc > 0 ? (ap.currentQty / ap.ppc / ap.cpp) : 0;
                const correctedPal = ap.cpp > 0 && ap.ppc > 0 ? (correctedQty / ap.ppc / ap.cpp) : 0;

                console.log(`  ┌─────────────────────────────────────────────────────`);
                console.log(`  │ ${ap.productName} (ID: ${ap.productId})`);
                console.log(`  ├─────────────────────────────────────────────────────`);
                console.log(`  │ Current Qty:     ${ap.currentQty.toFixed(4)}`);
                console.log(`  │ Phantom Qty:     ${ap.orphanedQty > 0 ? '+' : ''}${ap.orphanedQty.toFixed(4)} (from deleted PO)`);
                console.log(`  │ Corrected Qty:   ${correctedQty.toFixed(4)}`);
                console.log(`  │ Current Palettes: ${currentPal.toFixed(2)}`);
                console.log(`  │ Correct Palettes: ${correctedPal.toFixed(2)}`);
                console.log(`  │ ppc: ${ap.ppc} | cpp: ${ap.cpp}`);
                console.log(`  │`);
                console.log(`  │ Orphaned Transactions:`);
                for (const ot of ap.orphanedTransactions) {
                    console.log(`  │   TX#${ot.transactionid} | ${ot.transactiontype} ${ot.quantity} | PO#${ot.po_id} (DELETED) | By: ${ot.username} | ${ot.createdat}`);
                }
                console.log(`  └─────────────────────────────────────────────────────\n`);
            }
        }

        // 8. Also show valid PURCHASE_UPDATE transactions for awareness
        if (validTransactions.length > 0) {
            console.log('=================================================================');
            console.log('  VALID PURCHASE_UPDATE transactions (PO still exists)');
            console.log('=================================================================\n');
            
            for (const tx of validTransactions) {
                console.log(`  TX#${tx.transactionid} | ${tx.transactiontype} ${tx.quantity} | PO: ${tx.poNumber} (${tx.poStatus}) | Product: ${tx.productname} | By: ${tx.username}`);
            }
        }

        // 9. Summary
        console.log('\n=================================================================');
        console.log('                     SUMMARY');
        console.log('=================================================================');
        console.log(`  Total PURCHASE_UPDATE transactions: ${allPurchaseUpdates.rows.length}`);
        console.log(`  Orphaned (PO deleted):              ${orphanedTransactions.length}`);
        console.log(`  Valid (PO exists):                  ${validTransactions.length}`);
        console.log(`  Products affected by phantom stock: ${affectedProducts.length}`);
        
        if (affectedProducts.length > 0) {
            console.log('\n  Products needing correction:');
            for (const ap of affectedProducts) {
                const correctedQty = ap.currentQty - ap.orphanedQty;
                console.log(`    - ${ap.productName}: ${ap.currentQty.toFixed(2)} → ${correctedQty.toFixed(2)} (remove ${ap.orphanedQty.toFixed(2)})`);
            }
        }
        console.log('');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

findAffectedProducts();

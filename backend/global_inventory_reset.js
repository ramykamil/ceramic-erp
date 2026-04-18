const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to true for safety

async function reconcile() {
    const client = await pool.connect();
    try {
        console.log(`--- Global Inventory Reconciliation (DRY_RUN: ${DRY_RUN}) ---`);
        console.log('Anchor: Sync update (Apr 7). Range: Apr 6 - Apr 17. Exclude Apr 18.');

        // 1. Get all anchors
        console.log('Fetching anchors...');
        const anchorsRes = await client.query(`
            SELECT DISTINCT ON (productid) productid, quantity
            FROM inventorytransactions
            WHERE notes ILIKE '%Sync update%'
            ORDER BY productid, createdat DESC
        `);
        const anchorMap = new Map(anchorsRes.rows.map(r => [r.productid, parseFloat(r.quantity)]));

        // 2. Calculate deltas for all products in the date range
        console.log('Calculating deltas for Apr 6-17...');
        const deltaRes = await client.query(`
            SELECT 
                it.productid,
                SUM(CASE 
                    WHEN it.transactiontype = 'IN' THEN it.quantity 
                    WHEN it.transactiontype = 'OUT' THEN -it.quantity 
                    ELSE 0 
                END) as net_delta
            FROM inventorytransactions it
            LEFT JOIN orders o ON it.referenceid = o.orderid AND it.referencetype = 'ORDER'
            LEFT JOIN goodsreceipts gr ON it.referenceid = gr.receiptid AND it.referencetype = 'GOODS_RECEIPT'
            LEFT JOIN returns r ON it.referenceid = r.returnid AND it.referencetype = 'RETURN'
            LEFT JOIN purchasereturns pr ON it.referenceid = pr.returnid AND it.referencetype = 'RETURN_TO_SUPPLIER'
            WHERE it.createdat >= '2026-04-06 00:00:00' 
              AND it.createdat <= '2026-04-17 23:59:59'
              AND (
                (it.referencetype = 'ORDER' AND o.orderid IS NOT NULL) OR
                (it.referencetype = 'GOODS_RECEIPT' AND gr.receiptid IS NOT NULL) OR
                (it.referencetype = 'RETURN' AND r.returnid IS NOT NULL) OR
                (it.referencetype = 'RETURN_TO_SUPPLIER' AND pr.returnid IS NOT NULL)
              )
            GROUP BY it.productid
        `);
        const deltaMap = new Map(deltaRes.rows.map(r => [r.productid, parseFloat(r.net_delta)]));

        // 3. Process all active products
        console.log('Processing results...');
        const productsRes = await client.query('SELECT ProductID, ProductName, QteParColis, QteColisParPalette FROM Products WHERE IsActive = TRUE');
        const currentInvRes = await client.query('SELECT ProductID, QuantityOnHand FROM Inventory');
        const currentInvMap = new Map(currentInvRes.rows.map(r => [r.productid, parseFloat(r.quantityonhand)]));

        const updates = [];

        for (const p of productsRes.rows) {
            const anchor = anchorMap.get(p.productid) || 0;
            const delta = deltaMap.get(p.productid) || 0;
            const targetQty = anchor + delta;
            const currentQty = currentInvMap.get(p.productid);

            if (currentQty !== undefined && Math.abs(currentQty - targetQty) > 0.001) {
                updates.push({
                    pid: p.productid,
                    name: p.productname,
                    anchor,
                    delta,
                    target: targetQty,
                    current: currentQty,
                    diff: targetQty - currentQty,
                    ppc: parseFloat(p.qteparcolis) || 0,
                    cpp: parseFloat(p.qtecolisparpalette) || 0
                });
            }
        }

        console.log(`Identified ${updates.length} products needing reconciliation.`);

        if (!DRY_RUN) {
            await client.query('BEGIN');
            console.log('APPLYING CHANGES TO DATABASE...');
            for (const up of updates) {
                const newColis = up.ppc > 0 ? parseFloat((up.target / up.ppc).toFixed(4)) : 0;
                const newPallets = up.cpp > 0 ? parseFloat((newColis / up.cpp).toFixed(4)) : 0;

                await client.query(`
                    UPDATE inventory 
                    SET quantityonhand = $1, coliscount = $2, palletcount = $3, updatedat = CURRENT_TIMESTAMP
                    WHERE productid = $4
                `, [up.target, newColis, newPallets, up.pid]);

                await client.query(`
                    INSERT INTO inventorytransactions (productid, transactiontype, quantity, referencetype, notes, createdat)
                    VALUES ($1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', $3, CURRENT_TIMESTAMP)
                `, [up.pid, up.diff, `[FINAL RECONCILIATION] Formula: Apr 7 Anchor (${up.anchor}) + Delta (${up.delta.toFixed(2)})`]);
            }
            await client.query('COMMIT');
            console.log('Reconciliation committed.');
            try { await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue'); } catch (e) {}
        } else {
            console.log('DRY RUN COMPLETE. No changes were made.');
            console.table(updates.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 20).map(u => ({
                Name: u.name,
                'Anchor(Apr7)': u.anchor,
                'Delta(6-17)': u.delta,
                Expected: u.target.toFixed(2),
                CurrentPr: u.current.toFixed(2),
                Diff: u.diff.toFixed(2)
            })));
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

reconcile();

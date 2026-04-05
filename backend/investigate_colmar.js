require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function investigate() {
    const client = await pool.connect();
    try {
        const productId = 435;
        console.log(`=== DEEP DIVE: Product ${productId} - COLMAR BEIGE 45/45 ===\n`);

        // 1. Product info
        const prod = await client.query(`
            SELECT p.*, u.unitcode as primary_unit_code
            FROM Products p LEFT JOIN Units u ON p.primaryunitid = u.unitid
            WHERE p.productid = $1
        `, [productId]);
        const p = prod.rows[0];
        console.log('Product:', JSON.stringify({
            id: p.productid, name: p.productname, code: p.productcode,
            size: p.size, primaryUnit: p.primary_unit_code,
            qteparcolis: p.qteparcolis, qtecolisparpalette: p.qtecolisparpalette
        }, null, 2));

        // 2. Current inventory
        const inv = await client.query('SELECT * FROM Inventory WHERE productid = $1', [productId]);
        console.log('\nInventory records:');
        for (const r of inv.rows) {
            console.log(`  InventoryID: ${r.inventoryid} | Qty: ${r.quantityonhand} | Reserved: ${r.quantityreserved} | Ownership: ${r.ownershiptype} | FactoryID: ${r.factoryid} | WarehouseID: ${r.warehouseid}`);
        }

        // 3. ALL inventory transactions (chronological)
        const txns = await client.query(`
            SELECT * FROM InventoryTransactions WHERE productid = $1 ORDER BY createdat ASC
        `, [productId]);
        console.log(`\nAll ${txns.rows.length} inventory transactions:`);
        let running = 0;
        for (const t of txns.rows) {
            const qty = parseFloat(t.quantity);
            if (t.transactiontype === 'IN' || t.transactiontype === 'ADJUSTMENT') {
                running += qty;
            } else if (t.transactiontype === 'OUT') {
                running -= qty;
            }
            console.log(`  ${t.createdat} | ${t.transactiontype} | ${qty > 0 ? '+' : ''}${qty.toFixed(2)} | Running: ${running.toFixed(2)} | Ref: ${t.referencetype}/${t.referenceid || 'N/A'} | Notes: ${t.notes || 'N/A'} | Ownership: ${t.ownershiptype}`);
        }

        // 4. GoodsReceipt items
        const gr = await client.query(`
            SELECT gri.*, gr.grnumber, gr.createdat as gr_date
            FROM GoodsReceiptItems gri
            JOIN GoodsReceipts gr ON gri.goodsreceiptid = gr.goodsreceiptid
            WHERE gri.productid = $1
            ORDER BY gr.createdat ASC
        `, [productId]);
        console.log(`\nGoodsReceipt items (${gr.rows.length}):`);
        for (const g of gr.rows) {
            console.log(`  GR: ${g.grnumber} | Date: ${g.gr_date} | Qty Received: ${g.quantityreceived}`);
        }

        // 5. Order items (sales)
        const orders = await client.query(`
            SELECT oi.*, o.ordernumber, o.status, o.createdat as order_date, u.unitcode
            FROM OrderItems oi
            JOIN Orders o ON oi.orderid = o.orderid
            LEFT JOIN Units u ON oi.unitid = u.unitid
            WHERE oi.productid = $1
            ORDER BY o.createdat ASC
        `, [productId]);
        console.log(`\nOrder items (sales) (${orders.rows.length}):`);
        for (const o of orders.rows) {
            console.log(`  Order: ${o.ordernumber} | Status: ${o.status} | Date: ${o.order_date} | Qty: ${o.quantity} | Unit: ${o.unitcode}`);
        }

        // 6. Summary
        const totalGR = gr.rows.reduce((s, g) => s + parseFloat(g.quantityreceived), 0);
        const totalSold = orders.rows.filter(o => o.status !== 'CANCELLED' && o.status !== 'PENDING').reduce((s, o) => s + parseFloat(o.quantity), 0);
        const currentQty = inv.rows.reduce((s, r) => s + parseFloat(r.quantityonhand), 0);

        console.log('\n=== SUMMARY ===');
        console.log(`Total GR received: ${totalGR.toFixed(2)}`);
        console.log(`Total sold (CONFIRMED/DELIVERED): ${totalSold.toFixed(2)}`);
        console.log(`Expected from GR-Sales: ${(totalGR - totalSold).toFixed(2)}`);
        console.log(`Current inventory: ${currentQty.toFixed(2)}`);
        console.log(`Excess stock: ${(currentQty - (totalGR - totalSold)).toFixed(2)}`);
        console.log(`\nThis excess is the imported stock that should have been cleared by the bulk fix.`);

    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        client.release();
        pool.end();
    }
}
investigate();

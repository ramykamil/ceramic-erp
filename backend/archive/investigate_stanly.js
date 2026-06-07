
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function investigate() {
    try {
        console.log("Searching for product: STANLY MARFIL TERRE CUITE 45/45");
        const productRes = await pool.query("SELECT * FROM products WHERE productname ILIKE '%STANLY MARFIL TERRE CUITE 45/45%'");
        if (productRes.rows.length === 0) {
            console.log("Product not found");
            return;
        }
        
        const product = productRes.rows[0];
        console.log("Product Found:", JSON.stringify({
            productid: product.productid,
            productname: product.productname,
            productcode: product.productcode,
            qteparcolis: product.qteparcolis,
            cartonsperpalette: product.cartonsperpalette
        }, null, 2));
        
        const productId = product.productid;
        
        // Check current inventory
        const inventoryRes = await pool.query("SELECT * FROM inventory WHERE productid = $1", [productId]);
        console.log("Current Inventory Record(s):", JSON.stringify(inventoryRes.rows, null, 2));
        
        // Check Purchase History
        const purchaseRes = await pool.query(`
            SELECT po.ponumber, po.orderdate, poi.quantity, poi.palettes, poi.cartons
            FROM purchaseorderitems poi
            JOIN purchaseorders po ON poi.purchaseorderid = po.purchaseorderid
            WHERE poi.productid = $1
            ORDER BY po.orderdate DESC
        `, [productId]);
        console.log("Purchase History:", JSON.stringify(purchaseRes.rows, null, 2));
        
        // Total from history
        const historyTotalPalettes = purchaseRes.rows.reduce((sum, row) => sum + parseFloat(row.palettes || 0), 0);
        console.log("History Total Palettes:", historyTotalPalettes);

        // Check Sales History
        const salesRes = await pool.query(`
            SELECT o.ordernumber, o.orderdate, oi.quantity, oi.lineunit
            FROM orderitems oi
            JOIN orders o ON oi.orderid = o.orderid
            WHERE oi.productid = $1 AND o.status != 'CANCELLED'
            ORDER BY o.orderdate DESC
        `, [productId]);
        console.log("Sales History Count:", salesRes.rows.length);
        
        // Check Inventory Transactions
        const transRes = await pool.query(`
            SELECT transactiontype, quantity, notes, createdat, referencetype, referenceid
            FROM inventorytransactions
            WHERE productid = $1
            ORDER BY createdat ASC
        `, [productId]);
        console.log("Total Inventory Transactions:", transRes.rows.length);
        
        // Transaction Summary
        const summary = transRes.rows.reduce((acc, row) => {
            acc[row.transactiontype] = (acc[row.transactiontype] || 0) + parseFloat(row.quantity || 0);
            return acc;
        }, {});
        console.log("Transaction Summary (Qty):", JSON.stringify(summary, null, 2));

        // Let's also check if there are any transactions without a reference (might be manual adjustments)
        const manualTrans = transRes.rows.filter(t => !t.referenceid && t.transactiontype === 'ADJUSTMENT');
        console.log("Manual Adjustments:", JSON.stringify(manualTrans, null, 2));

        // Check specifically for 'IN' transactions that are not from POs
        const otherInTrans = transRes.rows.filter(t => t.transactiontype === 'IN' && t.referencetype !== 'PURCHASE_ORDER');
        console.log("Non-PO 'IN' Transactions:", JSON.stringify(otherInTrans, null, 2));

    } catch (err) {
        console.error("Error during investigation:", err);
    } finally {
        await pool.end();
    }
}

investigate();

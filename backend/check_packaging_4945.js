
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkProductPackaging() {
    try {
        const res = await pool.query("SELECT productid, productname, qteparcolis, qtecolisparpalette, piecespercarton, cartonsperpalette FROM products WHERE productid = 4945");
        console.log("Product Packaging Details:", JSON.stringify(res.rows[0], null, 2));
        
        const poRes = await pool.query(`
            SELECT poi.quantity, poi.purchaseorderid, po.ponumber, po.orderdate
            FROM purchaseorderitems poi
            JOIN purchaseorders po ON poi.purchaseorderid = po.purchaseorderid
            WHERE poi.productid = 4945
        `);
        console.log("Purchase Order Items (Quantity):", JSON.stringify(poRes.rows, null, 2));
        
        const totalQty = poRes.rows.reduce((sum, row) => sum + parseFloat(row.quantity), 0);
        console.log("Total Quantity from POs:", totalQty);

        // Current Inventory
        const invRes = await pool.query("SELECT quantityonhand, palletcount, coliscount FROM inventory WHERE productid = 4945");
        console.log("Inventory Stock:", JSON.stringify(invRes.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkProductPackaging();

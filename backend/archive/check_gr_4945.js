
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkGRs() {
    try {
        const res = await pool.query(`
            SELECT gr.receiptid, gr.receiptnumber, gr.purchaseorderid, po.ponumber, gri.quantityreceived, gri.productid
            FROM goodsreceipts gr
            JOIN goodsreceiptitems gri ON gr.receiptid = gri.receiptid
            LEFT JOIN purchaseorders po ON gr.purchaseorderid = po.purchaseorderid
            WHERE gri.productid = 4945
            ORDER BY gr.receiptdate ASC
        `);
        console.log("Goods Receipts for 4945:");
        console.table(res.rows);
        
        const totalGR = res.rows.reduce((sum, row) => sum + parseFloat(row.quantityreceived), 0);
        console.log("Total Received via GRs:", totalGR);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkGRs();

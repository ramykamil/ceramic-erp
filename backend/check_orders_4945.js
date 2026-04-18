
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkOrderDetails() {
    try {
        const res = await pool.query(`
            SELECT oi.orderid, oi.quantity, oi.unitid, u.unitcode, o.ordernumber, o.orderdate, it.quantity as trans_qty
            FROM orderitems oi
            JOIN orders o ON oi.orderid = o.orderid
            JOIN units u ON oi.unitid = u.unitid
            LEFT JOIN inventorytransactions it ON it.referencetype = 'ORDER' AND it.referenceid = oi.orderid AND it.productid = oi.productid
            WHERE oi.productid = 4945 AND o.status != 'CANCELLED'
        `);
        console.log("Order Details for 4945:");
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkOrderDetails();

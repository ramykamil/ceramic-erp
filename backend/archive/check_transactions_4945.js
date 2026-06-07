
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkTransactions() {
    try {
        const res = await pool.query(`
            SELECT transactionid, transactiontype, quantity, referencetype, referenceid, notes, createdat, createdby
            FROM inventorytransactions
            WHERE productid = 4945
            ORDER BY createdat ASC
        `);
        console.log("Inventory Transactions for 4945:");
        console.table(res.rows);
        
        // Sum by type
        const summary = res.rows.reduce((acc, row) => {
            acc[row.transactiontype] = (acc[row.transactiontype] || 0) + parseFloat(row.quantity);
            return acc;
        }, {});
        console.log("Transaction Summary:", summary);

        // Check for orders (sales)
        const orderRes = await pool.query(`
            SELECT oi.quantity, oi.orderid, o.ordernumber, o.orderdate, o.status
            FROM orderitems oi
            JOIN orders o ON oi.orderid = o.orderid
            WHERE oi.productid = 4945 AND o.status != 'CANCELLED'
        `);
        console.log("Sales Orders:");
        console.table(orderRes.rows);
        const totalSold = orderRes.rows.reduce((sum, row) => sum + parseFloat(row.quantity), 0);
        console.log("Total Sold:", totalSold);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkTransactions();

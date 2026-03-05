require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        const cid = 118;
        console.log(`\n============================`);
        console.log(`Raw data for Customer ID: ${cid}`);

        const ordersRes = await client.query(`
      SELECT *
      FROM Orders
      WHERE CustomerID = $1
    `, [cid]);
        console.log('Orders:', ordersRes.rows);

        const paymentsRes = await client.query(`
      SELECT ct.*
      FROM CashTransactions ct
      LEFT JOIN Orders o ON ct.ReferenceType = 'ORDER' AND ct.ReferenceID = o.OrderID
      WHERE 
        (ct.ReferenceType IN ('CLIENT', 'CUSTOMER') AND ct.ReferenceID = $1)
        OR 
        (ct.ReferenceType = 'ORDER' AND o.CustomerID = $1)
    `, [cid]);

        console.log('Cash Transactions:', paymentsRes.rows);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();

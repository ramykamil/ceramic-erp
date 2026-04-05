require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find all CONFIRMED or DELIVERED wholesale orders with payments.
        // finalizeOrder double-subtracted the order's PaymentAmount from the customer's CurrentBalance.
        // By adding it back, we perfectly restore the balance to what it should have been.
        const query = `
      SELECT o.OrderID, o.CustomerID, o.PaymentAmount, o.OrderNumber, c.CustomerName
      FROM Orders o
      JOIN Customers c ON o.CustomerID = c.CustomerID
      WHERE o.Status IN ('CONFIRMED', 'DELIVERED')
        AND o.OrderType != 'RETAIL' 
        AND c.CustomerType != 'RETAIL'
        AND o.PaymentAmount > 0
    `;
        const res = await client.query(query);

        console.log(`Found ${res.rows.length} affected wholesale orders with payments.`);
        let clientFixes = {};

        for (let row of res.rows) {
            if (!clientFixes[row.customerid]) {
                clientFixes[row.customerid] = { total: 0, orders: [], name: row.customername };
            }
            clientFixes[row.customerid].total += parseFloat(row.paymentamount);
            clientFixes[row.customerid].orders.push(row.ordernumber);
        }

        for (let cid of Object.keys(clientFixes)) {
            let data = clientFixes[cid];
            console.log(`\nCustomer ID: ${cid} (${data.name})`);
            console.log(`Affected Orders: ${data.orders.join(', ')}`);
            console.log(`Action: ADDING ${data.total} to CurrentBalance to compensate for the double-deduction.`);

            await client.query(
                'UPDATE Customers SET CurrentBalance = CurrentBalance + $1, UpdatedAt = CURRENT_TIMESTAMP WHERE CustomerID = $2',
                [data.total, cid]
            );
        }

        await client.query('COMMIT');
        console.log('\n✅ Successfully restored client balances!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error fixing balances:', e.message);
    } finally {
        client.release();
        pool.end();
    }
}

run();

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

        // Get all wholesale customers
        const customersRes = await client.query(`
      SELECT CustomerID, CustomerName, CurrentBalance, CustomerType 
      FROM Customers 
      WHERE CustomerType != 'RETAIL'
    `);

        let correctedCount = 0;

        for (const cust of customersRes.rows) {
            const cid = cust.customerid;
            const actualBalance = parseFloat(cust.currentbalance) || 0;

            // 1. Total Debt (Orders)
            const ordersRes = await client.query(`
        SELECT COALESCE(SUM(TotalAmount), 0) as totaldebt
        FROM Orders
        WHERE CustomerID = $1 AND Status IN ('CONFIRMED', 'DELIVERED', 'SHIPPED') AND OrderType != 'RETAIL'
      `, [cid]);
            let totalDebt = parseFloat(ordersRes.rows[0].totaldebt);

            // 2. Payments / Credits (CashTransactions)
            const paymentsRes = await client.query(`
        SELECT ct.TransactionType, ct.Amount
        FROM CashTransactions ct
        LEFT JOIN Orders o ON ct.ReferenceType = 'ORDER' AND ct.ReferenceID = o.OrderID
        WHERE 
        (
          (ct.ReferenceType IN ('CLIENT', 'CUSTOMER') AND ct.ReferenceID = $1)
          OR 
          (ct.ReferenceType = 'ORDER' AND o.CustomerID = $1)
        )
      `, [cid]);

            let totalPayments = 0;
            for (const row of paymentsRes.rows) {
                if (row.transactiontype === 'VERSEMENT' || row.transactiontype === 'ENCAISSEMENT') {
                    totalPayments += parseFloat(row.amount);
                }
            }

            const trueBalance = totalDebt - totalPayments;
            const difference = trueBalance - actualBalance;

            // If discrepancy exists, update it
            if (Math.abs(difference) >= 0.01) {
                console.log(`Fixing Customer ${cid} (${cust.customername}): Actual ${actualBalance} -> True ${trueBalance} (Diff: ${difference})`);
                await client.query(
                    'UPDATE Customers SET CurrentBalance = $1, UpdatedAt = CURRENT_TIMESTAMP WHERE CustomerID = $2',
                    [trueBalance, cid]
                );
                correctedCount++;
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ Ledgers synchronized successfully. Corrected ${correctedCount} customers.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();

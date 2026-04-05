require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        const customerIds = [12, 28, 36, 85, 104, 118];

        for (const cid of customerIds) {
            console.log(`\n============================`);
            console.log(`Verifying Ledger for Customer ID: ${cid}`);
            const custRes = await client.query('SELECT CustomerName, CurrentBalance FROM Customers WHERE CustomerID = $1', [cid]);
            const actualBalance = parseFloat(custRes.rows[0].currentbalance);
            console.log(`Current State: ${custRes.rows[0].customername} | Actual Balance: ${actualBalance}`);

            // 1. Total Debt (Orders)
            const ordersRes = await client.query(`
        SELECT COALESCE(SUM(TotalAmount), 0) as totaldebt
        FROM Orders
        WHERE CustomerID = $1 AND Status IN ('CONFIRMED', 'DELIVERED', 'SHIPPED') AND OrderType != 'RETAIL'
      `, [cid]);
            let totalDebt = parseFloat(ordersRes.rows[0].totaldebt);

            // 2. Payments / Credits (CashTransactions)
            // Only include VERSEMENT, ENCAISSEMENT, VENTE? Wait, CashTransactions are linked to CLIENT or ORDER
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
                // VERSEMENT and ENCAISSEMENT are payments from the client (reduces their debt)
                if (row.transactiontype === 'VERSEMENT' || row.transactiontype === 'ENCAISSEMENT') {
                    totalPayments += parseFloat(row.amount);
                }
            }

            // 3. Any RETOUR_VENTE? Wait, let's also check if they have return orders.
            const returnsRes = await client.query(`
        SELECT COALESCE(SUM(TotalAmount), 0) as totalreturns
        FROM Invoices
        WHERE CustomerID = $1 AND Status = 'CANCELLED' -- just guessing if returns are handled this way
      `, [cid]); // Actually returns might have their own table or just reduce balance via CashTransactions

            const trueBalance = totalDebt - totalPayments;
            const difference = trueBalance - actualBalance;

            console.log(`- Total Sales Debt: ${totalDebt}`);
            console.log(`- Total Payments Received: ${totalPayments}`);
            console.log(`- Theoretical Balance: ${trueBalance}`);
            console.log(`- Actual Balance in DB: ${actualBalance}`);

            if (Math.abs(difference) < 0.01) {
                console.log(`✅ MATCH! The balance is mathematically perfect.`)
            } else {
                console.log(`❌ DISCREPANCY: Difference is ${difference}`);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();

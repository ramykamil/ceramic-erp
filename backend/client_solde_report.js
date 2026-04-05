/**
 * FULL CLIENT SOLDE REPORT
 * ========================
 * Extracts each customer's balance breakdown:
 *   - Confirmed orders (post-03-03 only, since old data was purged)
 *   - Payments made
 *   - Current balance in DB
 *   - Recalculated balance = Orders - Payments
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        // 1. Get all customers with their current balance
        const customers = await client.query(`
            SELECT CustomerID, CustomerCode, CustomerName, CustomerType, CurrentBalance
            FROM Customers
            WHERE IsActive = true
            ORDER BY CustomerName
        `);

        // 2. Get all confirmed orders grouped by customer
        const orders = await client.query(`
            SELECT CustomerID, OrderID, OrderNumber, OrderDate, TotalAmount, Status, CreatedAt
            FROM Orders
            WHERE Status = 'CONFIRMED'
            ORDER BY CustomerID, OrderDate DESC
        `);

        // 3. Get all payments grouped by customer
        const payments = await client.query(`
            SELECT CustomerID, PaymentID, PaymentDate, Amount, PaymentMethod, Notes, CreatedAt
            FROM Payments
            ORDER BY CustomerID, PaymentDate DESC
        `);

        // 4. Get cash transactions (versements) — may not have CustomerID
        let cashTxns = { rows: [] };
        try {
            cashTxns = await client.query(`
                SELECT ct.CustomerID, ct.TransactionID, ct.TransactionDate, ct.Amount, ct.TransactionType, ct.Description, ct.CreatedAt
                FROM CashTransactions ct
                WHERE ct.CustomerID IS NOT NULL
                ORDER BY ct.CustomerID, ct.TransactionDate DESC
            `);
        } catch (e) {
            console.log('Note: CashTransactions skipped (no CustomerID column)');
        }

        // Build maps
        const ordersByCustomer = {};
        for (const o of orders.rows) {
            if (!ordersByCustomer[o.customerid]) ordersByCustomer[o.customerid] = [];
            ordersByCustomer[o.customerid].push(o);
        }

        const paymentsByCustomer = {};
        for (const p of payments.rows) {
            if (!paymentsByCustomer[p.customerid]) paymentsByCustomer[p.customerid] = [];
            paymentsByCustomer[p.customerid].push(p);
        }

        const cashByCustomer = {};
        for (const ct of cashTxns.rows) {
            if (!cashByCustomer[ct.customerid]) cashByCustomer[ct.customerid] = [];
            cashByCustomer[ct.customerid].push(ct);
        }

        // 5. Build report
        let report = '='.repeat(90) + '\n';
        report += '  FULL CLIENT SOLDE REPORT\n';
        report += `  Generated: ${new Date().toISOString()}\n`;
        report += `  Data: Post-03-03-2026 only (older data was purged)\n`;
        report += '='.repeat(90) + '\n\n';

        // Summary table
        report += '--- SUMMARY ---\n\n';
        report += 'Customer'.padEnd(40) + 'Orders Total'.padStart(15) + 'Payments'.padStart(15) + 'Cash Txns'.padStart(15) + 'Calc Balance'.padStart(15) + 'DB Balance'.padStart(15) + 'Match?'.padStart(8) + '\n';
        report += '-'.repeat(123) + '\n';

        let totalOrders = 0;
        let totalPayments = 0;
        let totalCash = 0;
        let mismatchCount = 0;
        const clientsWithActivity = [];

        for (const c of customers.rows) {
            const custOrders = ordersByCustomer[c.customerid] || [];
            const custPayments = paymentsByCustomer[c.customerid] || [];
            const custCash = cashByCustomer[c.customerid] || [];

            const ordersTotal = custOrders.reduce((s, o) => s + parseFloat(o.totalamount || 0), 0);
            const paymentsTotal = custPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
            const cashTotal = custCash.reduce((s, ct) => {
                const amt = parseFloat(ct.amount || 0);
                return s + (ct.transactiontype === 'PAYMENT_IN' ? amt : -amt);
            }, 0);

            const calcBalance = ordersTotal - paymentsTotal;
            const dbBalance = parseFloat(c.currentbalance || 0);
            const match = Math.abs(calcBalance - dbBalance) < 0.01;

            if (ordersTotal > 0 || paymentsTotal > 0 || Math.abs(dbBalance) > 0.01 || custCash.length > 0) {
                clientsWithActivity.push({
                    ...c, ordersTotal, paymentsTotal, cashTotal, calcBalance, dbBalance, match,
                    orders: custOrders, payments: custPayments, cash: custCash
                });
            }

            totalOrders += ordersTotal;
            totalPayments += paymentsTotal;
            totalCash += cashTotal;
            if (!match) mismatchCount++;

            if (ordersTotal > 0 || paymentsTotal > 0 || Math.abs(dbBalance) > 0.01) {
                report += c.customername.substring(0, 38).padEnd(40)
                    + ordersTotal.toFixed(2).padStart(15)
                    + paymentsTotal.toFixed(2).padStart(15)
                    + cashTotal.toFixed(2).padStart(15)
                    + calcBalance.toFixed(2).padStart(15)
                    + dbBalance.toFixed(2).padStart(15)
                    + (match ? '  ✓' : '  ✗').padStart(8) + '\n';
            }
        }

        report += '-'.repeat(123) + '\n';
        report += 'TOTALS'.padEnd(40)
            + totalOrders.toFixed(2).padStart(15)
            + totalPayments.toFixed(2).padStart(15)
            + totalCash.toFixed(2).padStart(15) + '\n';
        report += `\nMismatches: ${mismatchCount}\n`;

        // 6. Detailed breakdown for clients with activity
        report += '\n\n' + '='.repeat(90) + '\n';
        report += '  DETAILED BREAKDOWN\n';
        report += '='.repeat(90) + '\n\n';

        for (const c of clientsWithActivity) {
            report += `\n${'─'.repeat(70)}\n`;
            report += `CLIENT: ${c.customername} [${c.customercode}] (${c.customertype})\n`;
            report += `DB Balance: ${c.dbBalance.toFixed(2)} DA | Calculated: ${c.calcBalance.toFixed(2)} DA ${c.match ? '✓' : '✗ MISMATCH'}\n`;
            report += `${'─'.repeat(70)}\n`;

            if (c.orders.length > 0) {
                report += `\n  CONFIRMED ORDERS (${c.orders.length}):\n`;
                for (const o of c.orders) {
                    const dt = new Date(o.orderdate).toLocaleDateString('fr-FR');
                    report += `    ${o.ordernumber}  ${dt}  ${parseFloat(o.totalamount).toFixed(2)} DA\n`;
                }
                report += `    Total: ${c.ordersTotal.toFixed(2)} DA\n`;
            }

            if (c.payments.length > 0) {
                report += `\n  PAYMENTS (${c.payments.length}):\n`;
                for (const p of c.payments) {
                    const dt = new Date(p.paymentdate).toLocaleDateString('fr-FR');
                    report += `    ${dt}  ${parseFloat(p.amount).toFixed(2)} DA  ${p.paymentmethod || ''} ${p.notes || ''}\n`;
                }
                report += `    Total: ${c.paymentsTotal.toFixed(2)} DA\n`;
            }

            if (c.cash.length > 0) {
                report += `\n  CASH TRANSACTIONS (${c.cash.length}):\n`;
                for (const ct of c.cash) {
                    const dt = new Date(ct.transactiondate).toLocaleDateString('fr-FR');
                    report += `    ${dt}  ${ct.transactiontype}  ${parseFloat(ct.amount).toFixed(2)} DA  ${ct.description || ''}\n`;
                }
            }
        }

        // Save
        const reportPath = path.resolve(__dirname, 'client_solde_report.txt');
        fs.writeFileSync(reportPath, report);
        console.log(`Report saved to: ${reportPath}`);

        // Print summary to console
        console.log(`\nClients with activity: ${clientsWithActivity.length}`);
        console.log(`Total confirmed orders: ${totalOrders.toFixed(2)} DA`);
        console.log(`Total payments: ${totalPayments.toFixed(2)} DA`);
        console.log(`Balance mismatches: ${mismatchCount}`);

        // Print clients with non-zero balance
        console.log('\n--- CLIENTS WITH NON-ZERO BALANCE ---');
        for (const c of clientsWithActivity.filter(x => Math.abs(x.dbBalance) > 0.01)) {
            console.log(`  ${c.customername}: ${c.dbBalance.toFixed(2)} DA (Orders: ${c.ordersTotal.toFixed(2)}, Payments: ${c.paymentsTotal.toFixed(2)})`);
        }

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

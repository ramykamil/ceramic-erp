/**
 * recalculate_client_balances.js
 * 
 * Recalculates CurrentBalance for ALL customers using actual order and payment data.
 * 
 * Formula: CurrentBalance = Σ(confirmed order totals) - Σ(all versements/encaissements)
 * 
 * Versements are captured from TWO sources:
 *   1. Direct client payments: ReferenceType IN ('CLIENT', 'CUSTOMER') AND ReferenceID = CustomerID
 *   2. Order-linked payments: ReferenceType = 'ORDER' AND the order belongs to the customer
 * 
 * Usage:
 *   node recalculate_client_balances.js          # Dry-run (report only)
 *   node recalculate_client_balances.js --apply   # Apply changes to database
 */

const pool = require('./src/config/database');

const APPLY = process.argv.includes('--apply');

async function main() {
    console.log('='.repeat(70));
    console.log(APPLY
        ? '🔴 LIVE MODE — Changes WILL be written to the database'
        : '🟡 DRY-RUN MODE — No changes will be made (pass --apply to execute)');
    console.log('='.repeat(70));

    try {
        // Get all customers
        const customersRes = await pool.query(
            'SELECT CustomerID, CustomerName, CustomerCode, CurrentBalance FROM Customers ORDER BY CustomerName'
        );
        const customers = customersRes.rows;
        console.log(`\nFound ${customers.length} customers.\n`);

        let updated = 0;
        let skipped = 0;
        const changes = [];

        for (const customer of customers) {
            const cid = customer.customerid;

            // 1. Sum of order totals (non-cancelled, confirmed/delivered/shipped/processing)
            //    These are the orders that actually affected balance via finalizeOrder.
            //    Only CONFIRMED+ orders add to debt (finalizeOrder sets status = CONFIRMED).
            const ordersRes = await pool.query(`
        SELECT COALESCE(SUM(TotalAmount), 0) AS total_orders
        FROM Orders
        WHERE CustomerID = $1
          AND Status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
          AND OrderType != 'RETAIL'
      `, [cid]);
            const totalOrders = parseFloat(ordersRes.rows[0].total_orders);

            // 1b. Retail orders: only unpaid portion adds to balance
            const retailRes = await pool.query(`
        SELECT COALESCE(SUM(TotalAmount - COALESCE(PaymentAmount, 0)), 0) AS total_retail_debt
        FROM Orders
        WHERE CustomerID = $1
          AND Status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
          AND OrderType = 'RETAIL'
      `, [cid]);
            const totalRetailDebt = parseFloat(retailRes.rows[0].total_retail_debt);

            // 2. Sum of all versements/encaissements linked to this customer
            //    Source A: Direct client payments (ReferenceType = CLIENT/CUSTOMER)
            //    Source B: Order-linked payments (ReferenceType = ORDER, joined via Orders.CustomerID)
            const paymentsRes = await pool.query(`
        SELECT COALESCE(SUM(ct.Amount), 0) AS total_payments
        FROM CashTransactions ct
        LEFT JOIN Orders o ON ct.ReferenceType = 'ORDER' AND ct.ReferenceID = o.OrderID
        WHERE
          ct.TransactionType IN ('VERSEMENT', 'ENCAISSEMENT')
          AND (
            (ct.ReferenceType IN ('CLIENT', 'CUSTOMER') AND ct.ReferenceID = $1)
            OR
            (ct.ReferenceType = 'ORDER' AND o.CustomerID = $1)
          )
      `, [cid]);
            const totalPayments = parseFloat(paymentsRes.rows[0].total_payments);

            // 3. Sum of returns (credits back to customer reduce their debt)
            const returnsRes = await pool.query(`
        SELECT COALESCE(SUM(ct.Amount), 0) AS total_returns
        FROM CashTransactions ct
        LEFT JOIN Orders o ON ct.ReferenceType = 'ORDER' AND ct.ReferenceID = o.OrderID
        WHERE
          ct.TransactionType = 'RETOUR_VENTE'
          AND (
            (ct.ReferenceType IN ('CLIENT', 'CUSTOMER') AND ct.ReferenceID = $1)
            OR
            (ct.ReferenceType = 'ORDER' AND o.CustomerID = $1)
          )
      `, [cid]);
            const totalReturns = parseFloat(returnsRes.rows[0].total_returns);

            // New balance = wholesale debt + retail debt - payments - returns
            const newBalance = totalOrders + totalRetailDebt - totalPayments - totalReturns;
            const oldBalance = parseFloat(customer.currentbalance);
            const diff = newBalance - oldBalance;

            if (Math.abs(diff) > 0.01) {
                changes.push({
                    name: customer.customername,
                    code: customer.customercode,
                    id: cid,
                    oldBalance,
                    newBalance,
                    diff,
                    totalOrders,
                    totalRetailDebt,
                    totalPayments,
                    totalReturns
                });

                if (APPLY) {
                    await pool.query(
                        'UPDATE Customers SET CurrentBalance = $1, UpdatedAt = NOW() WHERE CustomerID = $2',
                        [newBalance, cid]
                    );
                    updated++;
                }
            } else {
                skipped++;
            }
        }

        // Print report
        console.log('-'.repeat(70));
        console.log(`CHANGES NEEDED: ${changes.length} | Already correct: ${skipped}`);
        console.log('-'.repeat(70));

        for (const c of changes) {
            console.log(`\n  ${c.name} (${c.code}) [ID: ${c.id}]`);
            console.log(`    Orders (Wholesale): ${c.totalOrders.toFixed(2)} DA`);
            console.log(`    Orders (Retail unpaid): ${c.totalRetailDebt.toFixed(2)} DA`);
            console.log(`    Payments (Versements): -${c.totalPayments.toFixed(2)} DA`);
            console.log(`    Returns: -${c.totalReturns.toFixed(2)} DA`);
            console.log(`    Old Balance: ${c.oldBalance.toFixed(2)} DA → New Balance: ${c.newBalance.toFixed(2)} DA (Δ ${c.diff > 0 ? '+' : ''}${c.diff.toFixed(2)})`);
        }

        console.log('\n' + '='.repeat(70));
        if (APPLY) {
            console.log(`✅ APPLIED: ${updated} customer balances updated.`);
        } else {
            console.log(`📋 DRY-RUN COMPLETE. Run with --apply to execute changes.`);
        }
        console.log('='.repeat(70));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

main();

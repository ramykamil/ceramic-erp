require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

/**
 * Issue 2 & 3 Investigation
 * ==========================
 * Issue 2: Why do BARCELONA OCRE, ACRA BEIGE, SWISS BEIGE have 0 in DB?
 * Issue 3: Find all confirmed orders with products that had 0 stock
 */
async function main() {
    const client = await pool.connect();
    try {
        // ============================================================
        // ISSUE 2: Why are these 3 products at 0?
        // ============================================================
        console.log('='.repeat(70));
        console.log('  ISSUE 2: Why Do These Products Have 0 Inventory?');
        console.log('='.repeat(70));

        const targetProducts = ['BARCELONA OCRE 20/75', 'ACRA BEIGE REC 60/60', 'SWISS BEIGE REC 60/60'];

        for (const name of targetProducts) {
            console.log(`\n--- ${name} ---`);

            // Get product info
            const prodResult = await client.query(
                `SELECT p.ProductID, p.ProductCode, p.ProductName, p.IsActive 
                 FROM Products p WHERE UPPER(p.ProductName) = UPPER($1)`, [name]);

            if (prodResult.rows.length === 0) {
                console.log('  NOT FOUND in Products table!');
                continue;
            }

            const prod = prodResult.rows[0];
            console.log(`  ProductID: ${prod.productid}, Code: ${prod.productcode}, Active: ${prod.isactive}`);

            // Current inventory
            const invResult = await client.query(
                `SELECT * FROM Inventory WHERE ProductID = $1`, [prod.productid]);
            console.log(`  Inventory records: ${invResult.rows.length}`);
            for (const inv of invResult.rows) {
                console.log(`    WH=${inv.warehouseid}, Type=${inv.ownershiptype}, Qty=${parseFloat(inv.quantityonhand).toFixed(2)}, Reserved=${parseFloat(inv.quantityreserved).toFixed(2)}, Pallets=${parseFloat(inv.palletcount).toFixed(2)}, Colis=${parseFloat(inv.coliscount).toFixed(2)}`);
            }

            // Full transaction history
            const txResult = await client.query(`
                SELECT TransactionType, Quantity, ReferenceType, ReferenceID, Notes, CreatedAt
                FROM InventoryTransactions 
                WHERE ProductID = $1
                ORDER BY CreatedAt ASC
            `, [prod.productid]);

            console.log(`  Transaction history: ${txResult.rows.length} transactions`);
            let running = 0;
            for (const tx of txResult.rows) {
                const qty = parseFloat(tx.quantity) || 0;
                if (tx.transactiontype === 'OUT') running -= qty;
                else if (tx.transactiontype === 'IN') running += qty;
                else if (tx.transactiontype === 'ADJUSTMENT') running += qty;

                const dt = new Date(tx.createdat).toISOString().replace('T', ' ').substring(0, 19);
                const sign = tx.transactiontype === 'OUT' ? '-' : '+';
                console.log(`    ${dt} | ${tx.transactiontype.padEnd(12)} | ${sign}${Math.abs(qty).toFixed(2).padStart(10)} | Running: ${running.toFixed(2).padStart(10)} | ${tx.referencetype} | ${(tx.notes || '').substring(0, 50)}`);
            }
        }

        // ============================================================
        // ISSUE 3: Orders confirmed with 0-stock products
        // ============================================================
        console.log('\n\n' + '='.repeat(70));
        console.log('  ISSUE 3: Confirmed Orders Where Product Stock Was ≤ 0');
        console.log('='.repeat(70));

        // Find products with 0 or negative inventory that have confirmed order items
        const zeroStockOrdersResult = await client.query(`
            SELECT 
                o.OrderID, o.OrderNumber, o.Status, o.OrderDate, o.CreatedAt as OrderCreatedAt,
                oi.ProductID, oi.Quantity as OrderQty,
                p.ProductCode, p.ProductName,
                COALESCE(i.QuantityOnHand, 0) as CurrentStock
            FROM Orders o
            JOIN OrderItems oi ON o.OrderID = oi.OrderID
            JOIN Products p ON oi.ProductID = p.ProductID
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID AND i.OwnershipType = 'OWNED'
            WHERE o.Status = 'CONFIRMED'
              AND o.CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
              AND COALESCE(i.QuantityOnHand, 0) <= 0
            ORDER BY o.CreatedAt DESC
        `);

        console.log(`\nConfirmed orders (last 2 days) with products at 0 stock: ${zeroStockOrdersResult.rows.length} items\n`);

        let report = '';
        report += '='.repeat(80) + '\n';
        report += '  ISSUE 3: CONFIRMED ORDERS WITH ZERO-STOCK PRODUCTS\n';
        report += '='.repeat(80) + '\n\n';

        for (const row of zeroStockOrdersResult.rows) {
            const dt = new Date(row.ordercreatedat).toLocaleString('fr-FR');
            console.log(`  ${row.ordernumber} | ${dt} | [${row.productcode}] ${row.productname}`);
            console.log(`    Order Qty: ${parseFloat(row.orderqty).toFixed(2)} | Current Stock: ${parseFloat(row.currentstock).toFixed(2)}`);
            report += `${row.ordernumber} | ${dt}\n`;
            report += `  [${row.productcode}] ${row.productname}\n`;
            report += `  Order Qty: ${parseFloat(row.orderqty).toFixed(2)} | Current Stock: ${parseFloat(row.currentstock).toFixed(2)}\n\n`;
        }

        // Also find DUPLICATE confirmed orders (same order confirmed multiple times)
        console.log('\n\n--- DUPLICATE ORDER CONFIRMATIONS (same order number appearing multiple times) ---');
        const duplicateOrdersResult = await client.query(`
            SELECT o.OrderNumber, COUNT(*) as ConfirmCount, o.OrderID
            FROM Orders o
            WHERE o.Status = 'CONFIRMED'
              AND o.CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
            GROUP BY o.OrderNumber, o.OrderID
            HAVING COUNT(*) > 1
        `);
        console.log(`Duplicate confirmations: ${duplicateOrdersResult.rows.length}`);

        // Check for same order validated repeatedly (different order IDs, same-looking data)
        console.log('\n--- Checking for orders with same products sold multiple times (repeated sales) ---');
        const repeatedSalesResult = await client.query(`
            SELECT 
                oi.ProductID, p.ProductCode, p.ProductName,
                COUNT(DISTINCT o.OrderID) as OrderCount,
                SUM(oi.Quantity) as TotalQtySold,
                array_agg(DISTINCT o.OrderNumber) as OrderNumbers
            FROM OrderItems oi
            JOIN Orders o ON oi.OrderID = o.OrderID
            JOIN Products p ON oi.ProductID = p.ProductID
            WHERE o.Status = 'CONFIRMED'
              AND o.CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
            GROUP BY oi.ProductID, p.ProductCode, p.ProductName
            HAVING COUNT(DISTINCT o.OrderID) > 1
            ORDER BY SUM(oi.Quantity) DESC
            LIMIT 30
        `);

        console.log(`\nProducts sold in multiple confirmed orders (last 2 days):`);
        report += '\n' + '='.repeat(80) + '\n';
        report += '  PRODUCTS SOLD IN MULTIPLE CONFIRMED ORDERS (Last 2 Days)\n';
        report += '='.repeat(80) + '\n\n';
        for (const row of repeatedSalesResult.rows) {
            console.log(`  [${row.productcode}] ${row.productname}: ${row.ordercount} orders, Total Qty: ${parseFloat(row.totalqtysold).toFixed(2)}`);
            console.log(`    Orders: ${row.ordernumbers.join(', ')}`);
            report += `[${row.productcode}] ${row.productname}\n`;
            report += `  ${row.ordercount} orders, Total Qty: ${parseFloat(row.totalqtysold).toFixed(2)}\n`;
            report += `  Orders: ${row.ordernumbers.join(', ')}\n\n`;
        }

        // Check for inventory transactions showing negative (OUT when stock was 0)
        console.log('\n\n--- Products with negative running inventory (sold more than available) ---');
        const negativeInventoryResult = await client.query(`
            SELECT 
                p.ProductID, p.ProductCode, p.ProductName,
                COALESCE(SUM(i.QuantityOnHand), 0) as CurrentQty
            FROM Products p
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            WHERE p.IsActive = true
            GROUP BY p.ProductID, p.ProductCode, p.ProductName
            HAVING COALESCE(SUM(i.QuantityOnHand), 0) < 0
            ORDER BY COALESCE(SUM(i.QuantityOnHand), 0) ASC
        `);

        console.log(`\nProducts with NEGATIVE inventory right now: ${negativeInventoryResult.rows.length}`);
        report += '\n' + '='.repeat(80) + '\n';
        report += '  PRODUCTS WITH NEGATIVE INVENTORY (Current State)\n';
        report += '='.repeat(80) + '\n\n';
        for (const row of negativeInventoryResult.rows) {
            console.log(`  [${row.productcode}] ${row.productname}: ${parseFloat(row.currentqty).toFixed(2)}`);
            report += `[${row.productcode}] ${row.productname}: ${parseFloat(row.currentqty).toFixed(2)}\n`;
        }

        const reportPath = path.resolve(__dirname, 'issue2_3_investigation.txt');
        fs.writeFileSync(reportPath, report);
        console.log(`\nFull report saved to: ${reportPath}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

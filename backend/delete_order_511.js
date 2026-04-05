/**
 * Delete order ORD-2026-000511 and restore inventory for its items
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const ORDER_NUMBER = 'ORD-2026-000511';

async function main() {
    const client = await pool.connect();
    try {
        // 1. Find the order
        const orderRes = await client.query(
            'SELECT OrderID, OrderNumber, Status, TotalAmount, CustomerID FROM Orders WHERE OrderNumber = $1',
            [ORDER_NUMBER]
        );
        if (orderRes.rows.length === 0) {
            console.log('Order not found!');
            return;
        }
        const order = orderRes.rows[0];
        console.log(`Order: ${order.ordernumber} | Status: ${order.status} | Total: ${order.totalamount}`);

        // 2. Get order items
        const itemsRes = await client.query(`
            SELECT oi.OrderItemID, oi.ProductID, p.ProductName, oi.Quantity, p.QteParColis, p.QteColisParPalette
            FROM OrderItems oi JOIN Products p ON oi.ProductID = p.ProductID
            WHERE oi.OrderID = $1
        `, [order.orderid]);
        console.log(`\nOrder items (${itemsRes.rows.length}):`);
        for (const item of itemsRes.rows) {
            console.log(`  ${item.productname}: ${parseFloat(item.quantity).toFixed(2)}`);
        }

        // 3. Get related inventory transactions
        const txnRes = await client.query(
            `SELECT TransactionID, ProductID, Quantity, TransactionType FROM InventoryTransactions WHERE ReferenceType = 'ORDER' AND ReferenceID = $1`,
            [order.orderid]
        );
        console.log(`\nRelated InventoryTransactions: ${txnRes.rows.length}`);

        await client.query('BEGIN');

        // 4. Restore inventory — add back the sold quantities
        for (const item of itemsRes.rows) {
            const qty = parseFloat(item.quantity);
            await client.query(
                'UPDATE Inventory SET QuantityOnHand = QuantityOnHand + $1, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $2 AND OwnershipType = \'OWNED\'',
                [qty, item.productid]
            );

            // Recalculate packaging
            const ppc = parseFloat(item.qteparcolis) || 0;
            const cpp = parseFloat(item.qtecolisparpalette) || 0;
            const invRes = await client.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1 AND OwnershipType = \'OWNED\'', [item.productid]);
            if (invRes.rows.length > 0) {
                const newQty = parseFloat(invRes.rows[0].quantityonhand);
                const newColis = ppc > 0 ? newQty / ppc : 0;
                const newPallets = cpp > 0 ? newColis / cpp : 0;
                await client.query('UPDATE Inventory SET ColisCount = $1, PalletCount = $2 WHERE ProductID = $3 AND OwnershipType = \'OWNED\'',
                    [newColis, newPallets, item.productid]);
            }
            console.log(`  ✓ Restored +${qty.toFixed(2)} to ${item.productname}`);
        }

        // 5. Delete inventory transactions for this order
        const delTxn = await client.query(
            'DELETE FROM InventoryTransactions WHERE ReferenceType = \'ORDER\' AND ReferenceID = $1',
            [order.orderid]
        );
        console.log(`\n  ✓ Deleted ${delTxn.rowCount} inventory transactions`);

        // 6. Delete invoices for this order
        const delInv = await client.query('DELETE FROM Invoices WHERE OrderID = $1', [order.orderid]);
        console.log(`  ✓ Deleted ${delInv.rowCount} invoices`);

        // 7. Delete order items (CASCADE should handle this, but be explicit)
        const delItems = await client.query('DELETE FROM OrderItems WHERE OrderID = $1', [order.orderid]);
        console.log(`  ✓ Deleted ${delItems.rowCount} order items`);

        // 8. Delete the order
        await client.query('DELETE FROM Orders WHERE OrderID = $1', [order.orderid]);
        console.log(`  ✓ Deleted order ${ORDER_NUMBER}`);

        // 9. Update customer balance
        await client.query(`
            UPDATE Customers SET CurrentBalance = (
                COALESCE((SELECT SUM(TotalAmount) FROM Orders WHERE CustomerID = $1 AND Status = 'CONFIRMED'), 0)
                - COALESCE((SELECT SUM(Amount) FROM Payments WHERE CustomerID = $1), 0)
            ) WHERE CustomerID = $1
        `, [order.customerid]);
        console.log(`  ✓ Customer balance recalculated`);

        await client.query('COMMIT');

        // Refresh MV
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('\nMV Catalogue refreshed.');
        } catch (e) { /* ignore */ }

        console.log('\n✅ Order deleted and inventory restored.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ERROR:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

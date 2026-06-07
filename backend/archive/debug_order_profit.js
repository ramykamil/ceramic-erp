const pool = require('./src/config/database');

async function debugOrder() {
    try {
        const orderNumber = 'ORD-2026-000043';
        console.log(`Fetching details for order: ${orderNumber}`);

        const orderRes = await pool.query('SELECT * FROM Orders WHERE OrderNumber = $1', [orderNumber]);
        if (orderRes.rows.length === 0) {
            console.log('Order not found');
            return;
        }
        const order = orderRes.rows[0];
        console.log('Order Header:', order);

        const itemsRes = await pool.query(`
      SELECT 
        oi.*, 
        p.ProductName, 
        p.ProductCode 
      FROM OrderItems oi 
      JOIN Products p ON oi.ProductID = p.ProductID 
      WHERE oi.OrderID = $1
    `, [order.orderid]);

        console.log('Order Items:');
        itemsRes.rows.forEach(item => {
            const cost = parseFloat(item.costprice);
            const qty = parseFloat(item.quantity);
            const lineTotal = parseFloat(item.linetotal);
            const totalCost = cost * qty;
            const profit = lineTotal - totalCost;
            console.log(`
        Product: ${item.productname} (${item.productcode})
        Qty: ${qty}
        UnitPrice: ${item.unitprice}
        CostPrice: ${cost}
        LineTotal: ${lineTotal}
        TotalCost (Calc): ${totalCost}
        Profit (Calc): ${profit}
      `);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

debugOrder();

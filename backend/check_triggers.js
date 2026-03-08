const pool = require('./src/config/database');

async function testUpdate() {
    await pool.connect();

    // 1. Get an existing order
    const orderRes = await pool.query("SELECT * FROM Orders ORDER BY OrderID DESC LIMIT 1");
    if (orderRes.rows.length === 0) return console.log("No orders");
    const order = orderRes.rows[0];
    console.log("OLD ORDERDATE:", order.orderdate);

    // 2. update directly using the exact same logic as updateOrder
    const newDate = '2023-05-15';

    const paymentAmount = order.paymentamount || 0;
    const delivery = order.deliverycost || 0;
    const disc = order.discount || 0;
    const timb = order.timber || 0;
    const totalAmount = order.totalamount || 0;

    await pool.query(`
    UPDATE Orders 
    SET CustomerID = $1, TotalAmount = $2, PaymentAmount = $3, PaymentMethod = $4, Notes = $5, DeliveryCost = $6, Discount = $7, Timber = $8, OrderDate = COALESCE($9, OrderDate), 
    ShippingAddress = $10, ClientPhone = $11,
    Status = 'PENDING', UpdatedAt = CURRENT_TIMESTAMP
    WHERE OrderID = $12
  `, [
        order.customerid || null, totalAmount, paymentAmount, order.paymentmethod, order.notes, delivery, disc, timb,
        newDate, // $9 orderDate
        order.shippingaddress, order.clientphone, order.orderid
    ]);

    // 3. check new order
    const orderRes2 = await pool.query("SELECT * FROM Orders WHERE OrderID = $1", [order.orderid]);
    console.log("NEW ORDERDATE:", orderRes2.rows[0].orderdate);

    pool.end();
}
testUpdate();

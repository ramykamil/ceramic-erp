const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ceramic_erp',
    password: 'postgres',
    port: 5432,
});

async function run() {
    try {
        const res = await pool.query(`
      SELECT 
        oi.OrderItemID, 
        oi.Quantity, 
        oi.UnitPrice, 
        oi.LineTotal, 
        oi.CostPrice, 
        oi.UnitID,
        u.UnitCode,
        p.ProductName, 
        p.PurchasePrice, 
        p.BasePrice, 
        p.Size,
        (oi.LineTotal - (oi.Quantity * oi.CostPrice)) as CalculatedBenefice
      FROM OrderItems oi 
      JOIN Products p ON oi.ProductID = p.ProductID 
      JOIN Units u ON oi.UnitID = u.UnitID 
      JOIN Orders o ON oi.OrderID = o.OrderID 
      WHERE o.OrderNumber = 'ORD-2026-000037';
    `);

        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        const orderRes = await pool.query(`SELECT * FROM Orders WHERE OrderNumber = 'ORD-2026-000037'`);
        console.log("ORDER HEADER:", JSON.stringify(orderRes.rows[0], null, 2));
        await pool.end();
    }
}

run();

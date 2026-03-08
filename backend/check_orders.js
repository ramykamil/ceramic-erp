const pool = require('./src/config/database');

async function checkOrders() {
    await pool.connect();
    const res = await pool.query("SELECT OrderID, OrderNumber, OrderDate, Status, UpdatedAt FROM Orders WHERE OrderNumber IN ('ORD-2026-000596', 'ORD-2026-000565', 'ORD-2026-000510')");
    console.log(res.rows);
    pool.end();
}
checkOrders();

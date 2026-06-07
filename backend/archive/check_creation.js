const pool = require('./src/config/database');

async function checkCreation() {
    await pool.connect();
    const res = await pool.query("SELECT OrderID, OrderNumber, OrderDate, CreatedAt, UpdatedAt FROM Orders WHERE OrderNumber IN ('ORD-2026-000596', 'ORD-2026-000565', 'ORD-2026-000510')");
    console.table(res.rows);
    pool.end();
}
checkCreation();

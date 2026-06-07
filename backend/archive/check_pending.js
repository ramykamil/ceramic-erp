const pool = require('./src/config/database');

async function checkAllPending() {
    await pool.connect();
    const res = await pool.query("SELECT OrderID, OrderNumber, OrderDate, Status, UpdatedAt, CreatedBy FROM Orders WHERE Status = 'PENDING' ORDER BY OrderID DESC LIMIT 20");
    console.log("PENDING ORDERS:");
    console.table(res.rows);
    pool.end();
}
checkAllPending();

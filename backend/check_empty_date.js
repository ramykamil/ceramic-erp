const pool = require('./src/config/database');

async function testFetch() {
    await pool.connect();
    // Simulate what getOrderById does
    const res = await pool.query("SELECT * FROM Orders ORDER BY OrderID DESC LIMIT 1");
    console.log("Raw from pool:", res.rows[0].orderdate);
    console.log("Type of orderdate:", typeof res.rows[0].orderdate);
    pool.end();
}
testFetch();

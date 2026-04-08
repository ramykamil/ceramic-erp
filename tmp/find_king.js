const path = require('path');
const pool = require('./backend/src/config/database');
async function find() {
    try {
        const res = await pool.query("SELECT ProductID, ProductName, ProductCode FROM Products WHERE ProductName ILIKE '%KING IVORY%'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
find();

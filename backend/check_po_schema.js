
const pool = require('./src/config/database');

async function checkPOSchema() {
    try {
        const res = await pool.query("SELECT * FROM PurchaseOrders LIMIT 1");
        console.table(res.rows);
        if (res.rows.length > 0) {
            console.log("Keys:", Object.keys(res.rows[0]));
        } else {
            const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'purchaseorders'");
            console.table(cols.rows);
        }
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
checkPOSchema();

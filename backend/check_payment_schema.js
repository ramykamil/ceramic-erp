
const pool = require('./src/config/database');

async function checkPaymentSchema() {
    try {
        const res = await pool.query("SELECT * FROM Payments LIMIT 1");
        if (res.rows.length > 0) {
            console.log("Keys:", Object.keys(res.rows[0]));
        } else {
            const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payments'");
            console.table(cols.rows);
        }
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
checkPaymentSchema();

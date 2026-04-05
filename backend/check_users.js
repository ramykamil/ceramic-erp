
const pool = require('./src/config/database');

async function checkUsers() {
    try {
        const res = await pool.query("SELECT Username, Role, IsActive FROM Users WHERE Role IN ('SALES', 'SALES_RETAIL')");
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkUsers();

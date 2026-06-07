require('dotenv').config();
const pool = require('./src/config/database');
async function test() {
    const res = await pool.query("SELECT COUNT(*) as count FROM mv_Catalogue WHERE ProductName ILIKE '%ALMERIA%'");
    console.log('Count ALMERIA:', res.rows[0].count);
    pool.end();
}
test();

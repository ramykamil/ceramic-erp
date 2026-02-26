require('dotenv').config();
const pool = require('./src/config/database');

async function checkInventoryLimit() {
    try {
        const res = await pool.query(`
      SELECT COUNT(*) as count FROM vw_CurrentInventory 
      WHERE ProductName < 'ALMERIA GRIS REC 60/60'
    `);
        console.log('Items before ALMERIA:', res.rows[0].count);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkInventoryLimit();

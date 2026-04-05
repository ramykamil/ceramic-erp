require('dotenv').config();
const pool = require('./src/config/database');

async function checkInventory() {
    try {
        const res = await pool.query(`
      SELECT * FROM vw_CurrentInventory 
      WHERE ProductName ILIKE '%ALMERIA GRIS REC 60/60%'
    `);
        console.log('vw_CurrentInventory:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkInventory();

require('dotenv').config();
const pool = require('./src/config/database');

async function checkProduct() {
    try {
        const res = await pool.query(`
      SELECT p.ProductID, p.ProductCode, p.ProductName, p.IsActive, 
             COALESCE(SUM(i.QuantityOnHand), 0) as totalQty
      FROM Products p
      LEFT JOIN Inventory i ON p.ProductID = i.ProductID
      WHERE p.ProductName ILIKE '%ALMERIA GRIS REC 60/60%'
      GROUP BY p.ProductID, p.ProductCode, p.ProductName, p.IsActive
    `);
        console.log('Products Table:', res.rows);

        const mvRes = await pool.query(`
      SELECT * FROM mv_Catalogue WHERE ProductName ILIKE '%ALMERIA GRIS REC 60/60%'
    `);
        console.log('mv_Catalogue:', mvRes.rows);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkProduct();

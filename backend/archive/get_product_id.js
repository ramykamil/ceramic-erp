const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ceramic_erp',
    password: 'postgres',
    port: 5432,
});

async function run() {
    try {
        const res = await pool.query(`
      SELECT ProductID, ProductName, PurchasePrice, BasePrice 
      FROM Products 
      WHERE ProductName LIKE '%LEO CREMA RELIEFE%'
    `);

        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();

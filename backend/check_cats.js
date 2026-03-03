require('dotenv').config();
const pool = require('./src/config/database');

async function run() {
    try {
        const client = await pool.connect();

        console.log('--- ALL CATEGORIES ---');
        const cats = await client.query(`SELECT CategoryID, CategoryName FROM Categories`);
        console.log(cats.rows);

        console.log('\n--- FIRST 10 PRODUCTS BY CREATION ---');
        const prods = await client.query(`
            SELECT p.ProductCode, p.ProductName, c.CategoryName, u.UnitCode, u.UnitName
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
            LIMIT 10
        `);
        console.log(prods.rows);

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

run();

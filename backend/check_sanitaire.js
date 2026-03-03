require('dotenv').config();
const pool = require('./src/config/database');

async function run() {
    try {
        const client = await pool.connect();

        console.log('Categories matching Sanit:');
        const cats = await client.query(`SELECT CategoryID, CategoryName FROM Categories WHERE CategoryName ILIKE '%Sanit%'`);
        console.log(cats.rows);

        console.log('\nProducts matching Sanit:');
        const prods = await client.query(`
            SELECT p.ProductName, c.CategoryName, u.UnitName, u.UnitCode
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
            WHERE c.CategoryName ILIKE '%Sanit%'
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

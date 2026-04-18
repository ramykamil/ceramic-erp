
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkProductDetails() {
    try {
        const res = await pool.query("SELECT productid, productname, size FROM products WHERE productid = 4945");
        console.log("Product Details:", JSON.stringify(res.rows[0], null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkProductDetails();

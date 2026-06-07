require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        const client = await pool.connect();
        const res = await client.query(`
            SELECT ProductID, ProductCode, ProductName, IsActive 
            FROM Products 
            WHERE ProductName ILIKE '%3D STONE CREMA%' 
               OR ProductName ILIKE '%AGATA BLACK%' 
        `);
        console.log("Matching from DB (Active/Inactive):", res.rows);

        // Let's also check the count of total products in the DB 
        const countRes = await client.query('SELECT COUNT(*) as count FROM Products');
        console.log("Total products in database:", countRes.rows[0].count);

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
main();

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        const result = await pool.query(`
            SELECT i.* 
            FROM Inventory i
            JOIN Products p ON i.ProductID = p.ProductID
            WHERE p.ProductName ILIKE '%CONCRETE GRIS 45/45%'
        `);
        console.log("Inventory Records:", result.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();

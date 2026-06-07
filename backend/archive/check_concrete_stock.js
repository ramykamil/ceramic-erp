require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        const result = await pool.query(`
            SELECT 
                p.ProductID, p.ProductName, p.ProductCode, p.BrandID, b.BrandName,
                COALESCE(SUM(i.QuantityOnHand), 0) AS TotalQty,
                COALESCE(SUM(i.PalletCount), 0) AS TotalPallets,
                COALESCE(SUM(i.ColisCount), 0) AS TotalColis
            FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            WHERE p.ProductName ILIKE '%CONCRETE GRIS 45/45%'
            GROUP BY p.ProductID, p.ProductName, p.ProductCode, b.BrandName
        `);
        console.log("Current Stock:", result.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        const result = await pool.query(`
            UPDATE Inventory 
            SET 
                QuantityOnHand = 1090.56,
                PalletCount = 16.00,
                ColisCount = 768.00
            WHERE ProductID = 4154 AND WarehouseID = 1
        `);
        console.log("Updated Product 4154 (CONFORT CERAM) inventory successfully.");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        const names = [
            "BARCELONA OCRE 20/75",
            "ACRA BEIGE REC 60/60",
            "SWISS BEIGE REC 60/60",
            "COTTO ROJO TERRE CUITE 45/45",
            "BERLIN BEIGE 45/45",
            "MAUREEN BLACK POLI REC 120/60"
        ];

        const res = await client.query(`
            SELECT p.ProductID, p.ProductCode, p.ProductName, p.Size, p.QteParColis, p.QteColisParPalette, i.QuantityOnHand, i.ColisCount, i.PalletCount, u.UnitCode
            FROM Products p
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
            WHERE p.ProductName = ANY($1) OR p.ProductCode = ANY($1)
        `, [names]);

        console.log("Current State of Problematic Products:");
        console.table(res.rows);

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}
main();

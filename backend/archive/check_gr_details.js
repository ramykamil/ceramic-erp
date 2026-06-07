
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkGRDetails() {
    try {
        const griRes = await pool.query(`
            SELECT gri.receiptid, gri.productid, gri.quantityreceived, gri.unitid, u.unitcode
            FROM goodsreceiptitems gri
            JOIN units u ON gri.unitid = u.unitid
            WHERE gri.receiptid IN (419, 422)
        `);
        console.log("Goods Receipt Items for 419 & 422:");
        console.table(griRes.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkGRDetails();

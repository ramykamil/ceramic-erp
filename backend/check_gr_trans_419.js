
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkGRTransactions() {
    try {
        const transRes = await pool.query(`
            SELECT it.transactionid, it.productid, p.productname, it.quantity, it.transactiontype, it.notes, it.createdat
            FROM inventorytransactions it
            JOIN products p ON it.productid = p.productid
            WHERE it.referencetype = 'GOODS_RECEIPT' AND it.referenceid = 419
        `);
        console.log("Transactions for GR 419:");
        console.table(transRes.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkGRTransactions();

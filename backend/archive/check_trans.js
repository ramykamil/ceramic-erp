require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        const cid = 118;
        console.log(`\n============================`);
        console.log(`Checking CashTransactions for order 304`);

        const transactions = await client.query(`
      SELECT *
      FROM CashTransactions 
      WHERE ReferenceID = $1
    `, [304]);
        console.log(transactions.rows);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();

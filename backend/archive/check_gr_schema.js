require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    const c = await pool.connect();
    try {
        // Get GoodsReceiptItems columns
        const schema = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'goodsreceiptitems' ORDER BY ordinal_position`);
        console.log('GoodsReceiptItems columns:');
        for (const r of schema.rows) console.log(`  ${r.column_name} (${r.data_type})`);

        // Get GR referenced by transaction
        const txn = await c.query(`SELECT * FROM InventoryTransactions WHERE productid = 435 AND referenceid = '124'`);
        console.log('\nTransaction referencing 124:', JSON.stringify(txn.rows, null, 2));

        // Find GR for COLMAR
        const grs = await c.query(`SELECT gr.* FROM GoodsReceipts gr WHERE gr.createdat > '2026-03-04' ORDER BY gr.createdat DESC LIMIT 10`);
        console.log('\nRecent GRs:');
        for (const g of grs.rows) console.log(`  ID: ${g[Object.keys(g)[0]]} | ${JSON.stringify(g)}`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        c.release();
        pool.end();
    }
})();

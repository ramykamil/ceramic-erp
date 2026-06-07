const pool = require('./src/config/database');

async function checkSchema() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('orderitems', 'inventory') 
      AND column_name IN ('palletcount', 'coliscount');
    `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

checkSchema();

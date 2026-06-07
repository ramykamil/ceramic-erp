const pool = require('./src/config/database');

async function checkAllTriggers() {
    await pool.connect();
    const res = await pool.query(`
    SELECT trigger_name, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'orders'
  `);
    console.log("TRIGGERS:", res.rows);
    pool.end();
}
checkAllTriggers();

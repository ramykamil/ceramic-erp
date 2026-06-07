const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query(`
      UPDATE Products 
      SET PrimaryUnitID = 1 
      WHERE PrimaryUnitID = 3 
        AND (qteparcolis % 1 = 0 OR qteparcolis IS NULL OR qteparcolis = 0)
      RETURNING ProductID, ProductName
    `);
    console.log('Fixed items:', res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

run();

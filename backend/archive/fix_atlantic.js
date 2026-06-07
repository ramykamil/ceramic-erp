const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(`
      UPDATE Products
      SET PrimaryUnitID = 3
      WHERE ProductName LIKE '%ATLANTIC STONE 45/45%'
      RETURNING ProductID, ProductName, PrimaryUnitID;
    `);
    console.log("Updated products:", res.rows);
    await client.query('COMMIT');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();

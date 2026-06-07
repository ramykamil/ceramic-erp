const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Starting correction of incorrectly set PCS products...');

    // Update products with decimal qteparcolis currently set to PCS (ID 1) to SQM (ID 3)
    const res = await client.query(`
      UPDATE Products
      SET PrimaryUnitID = 3
      WHERE PrimaryUnitID = 1 
        AND qteparcolis % 1 <> 0
      RETURNING ProductID, ProductName, qteparcolis
    `);
    
    console.log(`- Corrected ${res.rows.length} products to SQM (ID 3)`);
    if (res.rows.length > 0) {
      console.log('Some corrected products:', res.rows.slice(0, 5));
    }

    await client.query('COMMIT');
    console.log('Correction completed successfully.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Correction failed:', e);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();

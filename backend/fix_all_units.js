const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Starting bulk update of product units...');

    // 1. Update products with decimal qteparcolis to SQM (ID 3)
    const sqmRes = await client.query(`
      UPDATE Products
      SET PrimaryUnitID = 3
      WHERE PrimaryUnitID IS NULL 
        AND qteparcolis % 1 <> 0
      RETURNING ProductID
    `);
    console.log(`- Updated ${sqmRes.rows.length} products to SQM (ID 3)`);

    // 2. Update products with integer qteparcolis to PCS (ID 1)
    const pcsRes = await client.query(`
      UPDATE Products
      SET PrimaryUnitID = 1
      WHERE PrimaryUnitID IS NULL 
        AND qteparcolis % 1 = 0
      RETURNING ProductID
    `);
    console.log(`- Updated ${pcsRes.rows.length} products to PCS (ID 1)`);

    await client.query('COMMIT');
    console.log('Bulk update completed successfully.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Bulk update failed:', e);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();

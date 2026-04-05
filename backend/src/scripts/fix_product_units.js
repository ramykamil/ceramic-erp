const pool = require('../config/database');

async function fixProductUnits() {
    const client = await pool.connect();
    try {
        console.log('Starting ProductUnits repair...');
        await client.query('BEGIN');

        // 1. Clear the linking table completely
        console.log('Truncating ProductUnits...');
        await client.query('TRUNCATE TABLE ProductUnits RESTART IDENTITY CASCADE');

        // 2. Ensure Unit definitions exist
        console.log('Ensuring Units exist...');
        await client.query(`
      INSERT INTO Units (UnitCode, UnitName) 
      VALUES ('PCS', 'Pièce'), ('SQM', 'Mètre Carré') 
      ON CONFLICT (UnitCode) DO NOTHING
    `);

        // 3. Re-link ALL products
        console.log('Re-linking products...');
        const insertLinksQuery = `
      INSERT INTO ProductUnits (ProductID, UnitID, ConversionFactor, IsDefault)
      SELECT 
          p.ProductID,
          u.UnitID,
          1.0, 
          TRUE
      FROM Products p
      JOIN Units u ON u.UnitCode = (
          CASE 
              WHEN p.ProductName ILIKE '%(M²)%' OR p.ProductName ILIKE '%M2%' OR p.ProductName ILIKE '%/M2%' THEN 'SQM'
              ELSE 'PCS'
          END
      )
    `;
        const result = await client.query(insertLinksQuery);
        console.log(`Inserted ${result.rowCount} links.`);

        // 4. Sync the Products table's PrimaryUnitID column
        console.log('Syncing PrimaryUnitID...');
        await client.query(`
      UPDATE Products p
      SET PrimaryUnitID = pu.UnitID
      FROM ProductUnits pu
      WHERE p.ProductID = pu.ProductID AND pu.IsDefault = TRUE
    `);

        await client.query('COMMIT');
        console.log('Repair completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error repairing ProductUnits:', error);
    } finally {
        client.release();
        pool.end();
    }
}

fixProductUnits();

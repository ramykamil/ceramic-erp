const pool = require('./src/config/database');

async function fixNegativeBenefice() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Starting fix for Negative Benefice...');

        // 1. Fix the Product definition
        const productFix = await client.query(`
      UPDATE Products 
      SET PurchasePrice = 414.00 
      WHERE ProductID = 3292 AND PurchasePrice > 10000
      RETURNING *
    `);
        console.log('Updated Product:', productFix.rows[0] ? 'Success' : 'No change (already fixed?)');

        // 2. Fix the OrderItems with the bad cost
        const itemsFix = await client.query(`
      UPDATE OrderItems 
      SET CostPrice = 414.00 
      WHERE ProductID = 3292 AND CostPrice > 10000
      RETURNING *
    `);
        console.log(`Updated ${itemsFix.rowCount} OrderItems with incorrect cost.`);
        itemsFix.rows.forEach(item => {
            console.log(` - Fixed Item ID: ${item.orderitemid} (Order ID: ${item.orderid})`);
        });

        await client.query('COMMIT');
        console.log('Fix applied successfully.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error applying fix:', err);
    } finally {
        client.release();
        pool.end();
    }
}

fixNegativeBenefice();

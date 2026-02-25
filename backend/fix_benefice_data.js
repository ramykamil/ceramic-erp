const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ceramic_erp',
    password: 'postgres',
    port: 5432,
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Get the Product ID for "LEO CREMA RELIEFE 25/75 (M²)"
        const productRes = await client.query(`
      SELECT ProductID, ProductName, PurchasePrice, BasePrice 
      FROM Products 
      WHERE ProductName LIKE '%LEO CREMA RELIEFE 25/75 (M²)%'
    `);

        if (productRes.rows.length === 0) {
            throw new Error('Product not found');
        }

        const product = productRes.rows[0];
        console.log('Current Product Data:', product);

        // 2. Update Product Purchase Price to 800.00
        // We assume 800.00 based on the selling price (BasePrice) of 880.00
        // This fixes future orders.
        const updateProductRes = await client.query(`
      UPDATE Products 
      SET PurchasePrice = 800.00 
      WHERE ProductID = $1
      RETURNING *
    `, [product.productid]);

        console.log('Updated Product:', updateProductRes.rows[0]);

        // 3. Update the specific OrderItem (ID 311) in Order ORD-2026-000037
        // This fixes the historic record for this order.
        // OrderItemID 311 was identified in the debug script.
        const updateItemRes = await client.query(`
      UPDATE OrderItems 
      SET CostPrice = 800.00 
      WHERE OrderItemID = 311
      RETURNING *
    `);

        console.log('Updated Order Item:', updateItemRes.rows[0]);

        await client.query('COMMIT');
        console.log('Successfully updated data.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error executing fix:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();

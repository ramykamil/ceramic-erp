const { Pool } = require('pg');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function deepCheck() {
    try {
        // 1. Search for ALMERIA GRIS in any form
        console.log('=== Search for ANY trace of ALMERIA GRIS ===');
        const grisSearch = await cloudPool.query(`
      SELECT ProductID, ProductName, IsActive 
      FROM Products 
      WHERE ProductName ILIKE '%ALMERIA%GRIS%'
    `);
        console.log('ALMERIA GRIS in Products:', grisSearch.rows);

        // 2. What is productid 3373 on cloud?
        console.log('\n=== ProductID 3373 on cloud ===');
        const p3373 = await cloudPool.query(`SELECT ProductID, ProductName, IsActive, BrandID FROM Products WHERE ProductID = 3373`);
        console.log('ProductID 3373:', p3373.rows);

        // 3. What is productid 3460 on cloud?
        console.log('\n=== ProductID 3460 on cloud ===');
        const p3460 = await cloudPool.query(`SELECT ProductID, ProductName, IsActive, BrandID FROM Products WHERE ProductID = 3460`);
        console.log('ProductID 3460:', p3460.rows);

        // 4. How many products on cloud vs local?
        const cloudCount = await cloudPool.query(`SELECT COUNT(*) FROM Products WHERE IsActive = true`);
        console.log('\n=== Cloud active products:', cloudCount.rows[0].count, '===');

        // 5. Check max productid on cloud
        const maxId = await cloudPool.query(`SELECT MAX(ProductID) FROM Products`);
        console.log('Max ProductID on cloud:', maxId.rows[0].max);

        // 6. Check all ALMERIA products
        console.log('\n=== ALL ALMERIA products on cloud ===');
        const allAlmeria = await cloudPool.query(`
      SELECT p.ProductID, p.ProductName, p.IsActive, 
             COALESCE((SELECT SUM(QuantityOnHand) FROM Inventory WHERE ProductID = p.ProductID), 0) as totalQty
      FROM Products p
      WHERE p.ProductName ILIKE '%ALMERIA%'
      ORDER BY p.ProductName
    `);
        allAlmeria.rows.forEach(r =>
            console.log(`  [${r.productid}] ${r.productname} (Active: ${r.isactive}, Qty: ${r.totalqty})`)
        );

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        cloudPool.end();
    }
}

deepCheck();

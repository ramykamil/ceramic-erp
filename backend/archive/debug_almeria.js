require('dotenv').config();
const pool = require('./src/config/database');

async function debug() {
    try {
        // 1. Check materialized view definition
        console.log('=== 1. Materialized View Definition ===');
        const mvDef = await pool.query(`
      SELECT pg_get_viewdef('mv_catalogue'::regclass, true)
    `);
        console.log(mvDef.rows[0].pg_get_viewdef);

        // 2. Check if product 3373 is in mv_Catalogue
        console.log('\n=== 2. Product 3373 in mv_Catalogue ===');
        const mvCheck = await pool.query(`SELECT productid, productname FROM mv_Catalogue WHERE productid = 3373`);
        console.log('Found:', mvCheck.rows.length, mvCheck.rows);

        // 3. Simulate the exact getProducts query with search
        console.log('\n=== 3. Simulated getProducts search ===');
        const searchLower = 'almeria gris rec 60/60';
        const simQuery = await pool.query(`
      SELECT 
        mvc.ProductID, mvc.ProductName,
        COALESCE(inv.RealTotalQty, 0) as TotalQty
      FROM mv_Catalogue mvc
      LEFT JOIN Products p ON mvc.ProductID = p.ProductID
      LEFT JOIN (
        SELECT ProductID, SUM(QuantityOnHand) as RealTotalQty
        FROM Inventory GROUP BY ProductID
      ) inv ON mvc.ProductID = inv.ProductID
      WHERE productname_lower LIKE $1
      ORDER BY ProductName ASC
      LIMIT 100
    `, [`%${searchLower}%`]);
        console.log('Results:', simQuery.rows.length);
        simQuery.rows.forEach(r => console.log(`  - [${r.productid}] ${r.productname} (Qty: ${r.totalqty})`));

        // 4. Check if there's a UNIQUE constraint or duplicate issue
        console.log('\n=== 4. Check for duplicates in mv_Catalogue ===');
        const dupes = await pool.query(`
      SELECT productname, COUNT(*) as cnt 
      FROM mv_Catalogue 
      WHERE productname ILIKE '%ALMERIA%' 
      GROUP BY productname 
      ORDER BY productname
    `);
        dupes.rows.forEach(r => console.log(`  - ${r.productname}: ${r.cnt} entries`));

        // 5. Check the Products table directly  
        console.log('\n=== 5. Products table direct check ===');
        const prodCheck = await pool.query(`
      SELECT ProductID, ProductName, IsActive, BrandID 
      FROM Products 
      WHERE ProductName ILIKE '%ALMERIA GRIS REC 60/60%'
    `);
        prodCheck.rows.forEach(r => console.log(`  - [${r.productid}] ${r.productname} (Active: ${r.isactive}, BrandID: ${r.brandid})`));

        // 6. Check what the mv_Catalogue view query returns for this product
        console.log('\n=== 6. Check Brands table for BrandID 31 ===');
        const brandCheck = await pool.query(`SELECT * FROM Brands WHERE BrandID = 31`);
        console.log('Brand:', brandCheck.rows);

        // 7. Check the mv_Catalogue view query components
        console.log('\n=== 7. Check if product has required joins ===');
        const joinCheck = await pool.query(`
      SELECT p.ProductID, p.ProductName, p.BrandID, p.IsActive,
             b.BrandName, b.IsActive as BrandActive
      FROM Products p
      LEFT JOIN Brands b ON p.BrandID = b.BrandID
      WHERE p.ProductName = 'ALMERIA GRIS REC 60/60'
    `);
        console.log('Join check:', joinCheck.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

debug();

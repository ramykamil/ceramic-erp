const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function debugCloud() {
    try {
        console.log('=== CLOUD DB: Checking ALMERIA GRIS REC 60/60 ===');

        // 1. Check Products table
        const products = await pool.query(`
      SELECT ProductID, ProductName, IsActive, BrandID 
      FROM Products 
      WHERE ProductName ILIKE '%ALMERIA GRIS REC%'
    `);
        console.log('\n1. Products table:');
        products.rows.forEach(r => console.log(`  [${r.productid}] ${r.productname} (Active: ${r.isactive}, BrandID: ${r.brandid})`));

        // 2. Check mv_Catalogue
        console.log('\n2. mv_Catalogue:');
        try {
            const mv = await pool.query(`
        SELECT productid, productname, totalqty, famille 
        FROM mv_Catalogue 
        WHERE productname ILIKE '%ALMERIA GRIS REC%'
      `);
            mv.rows.forEach(r => console.log(`  [${r.productid}] ${r.productname} (Qty: ${r.totalqty}, Famille: ${r.famille})`));
            if (mv.rows.length === 0) console.log('  *** NO RESULTS IN mv_Catalogue! ***');
        } catch (err) {
            console.log('  ERROR querying mv_Catalogue:', err.message);
        }

        // 3. Check Inventory
        console.log('\n3. Inventory:');
        const inv = await pool.query(`
      SELECT i.InventoryID, i.ProductID, i.QuantityOnHand, i.OwnershipType, p.ProductName
      FROM Inventory i
      JOIN Products p ON i.ProductID = p.ProductID
      WHERE p.ProductName ILIKE '%ALMERIA GRIS REC 60/60%'
    `);
        inv.rows.forEach(r => console.log(`  [${r.inventoryid}] ${r.productname} (Qty: ${r.quantityonhand}, Type: ${r.ownershiptype})`));
        if (inv.rows.length === 0) console.log('  *** NO INVENTORY RECORDS! ***');

        // 4. Total products in mv_Catalogue
        const total = await pool.query(`SELECT COUNT(*) FROM mv_Catalogue`);
        console.log('\n4. Total products in mv_Catalogue:', total.rows[0].count);

        // 5. Check if ALMERIA BEIGE exists (the user could see this one)
        console.log('\n5. ALMERIA BEIGE check:');
        const beige = await pool.query(`SELECT productid, productname FROM mv_Catalogue WHERE productname ILIKE '%ALMERIA BEIGE%'`);
        beige.rows.forEach(r => console.log(`  [${r.productid}] ${r.productname}`));

    } catch (err) {
        console.error('Connection Error:', err.message);
    } finally {
        pool.end();
    }
}

debugCloud();

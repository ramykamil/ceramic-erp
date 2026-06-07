const { Pool } = require('pg');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function checkDupes() {
    try {
        console.log('=== Duplicate product names on cloud (active only) ===\n');
        const dupes = await cloudPool.query(`
      SELECT ProductName, COUNT(*) as cnt, 
             STRING_AGG(ProductID::text, ', ' ORDER BY ProductID) as ids,
             STRING_AGG(COALESCE(ROUND(COALESCE((SELECT SUM(QuantityOnHand) FROM Inventory WHERE ProductID = p.ProductID), 0), 2)::text, '0'), ', ' ORDER BY ProductID) as qtys
      FROM Products p
      WHERE IsActive = true
      GROUP BY ProductName
      HAVING COUNT(*) > 1
      ORDER BY ProductName
    `);

        if (dupes.rows.length === 0) {
            console.log('✅ No duplicate product names found!');
        } else {
            console.log(`Found ${dupes.rows.length} duplicate names:\n`);
            for (const d of dupes.rows) {
                // Get detailed info for each duplicate
                const details = await cloudPool.query(`
          SELECT p.ProductID, p.ProductName, p.BrandID, b.BrandName,
                 COALESCE((SELECT SUM(QuantityOnHand) FROM Inventory WHERE ProductID = p.ProductID), 0) as qty
          FROM Products p
          LEFT JOIN Brands b ON p.BrandID = b.BrandID
          WHERE p.ProductName = $1 AND p.IsActive = true
          ORDER BY p.ProductID
        `, [d.productname]);

                console.log(`"${d.productname}" — ${d.cnt} duplicates:`);
                details.rows.forEach(r => console.log(`    [${r.productid}] Brand: ${r.brandname || 'NULL'} | Qty: ${r.qty}`));
                console.log('');
            }
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        cloudPool.end();
    }
}

checkDupes();

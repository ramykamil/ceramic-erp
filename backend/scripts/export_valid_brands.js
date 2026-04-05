const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'ceramic_erp',
    user: 'postgres',
    password: 'postgres',
});

async function main() {
    try {
        const res = await pool.query(`
      SELECT p.ProductID, p.ProductCode, p.BrandID
      FROM Products p
      WHERE (p.ProductName LIKE 'FICHE:%' OR p.ProductCode LIKE 'FICHE:%') 
        AND p.BrandID IS NOT NULL
    `);

        fs.writeFileSync('c:\\Users\\PC\\OneDrive\\Bureau\\ceramic-erp-platform\\backend\\scripts\\fixed_brands.json', JSON.stringify(res.rows, null, 2));
        console.log(`Exported ${res.rows.length} valid product Brand mappings.`);

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();

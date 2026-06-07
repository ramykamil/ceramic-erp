const pool = require('./src/config/database');

async function checkProduct() {
    try {
        const query = "SELECT ProductCode, QteParColis, QteColisParPalette FROM Products WHERE ProductCode ILIKE '%LUKE%'";
        const res = await pool.query(query);
        console.log('Product Check Results:', res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkProduct();

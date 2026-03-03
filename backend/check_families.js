require('dotenv').config();
const pool = require('./src/config/database');

async function checkFamilies() {
    try {
        const client = await pool.connect();

        const families = [
            'ALLAOUA CERAM', 'ANDALOUS CERAM', 'BELLA CERAM', 'CERAM BOUMERDAS',
            'CERAM GLASS', 'CERAMIQUE CHARK', 'EL ATHMANIA', 'ELNOURASSI',
            'F CERAM', 'GRUPOPUMA', 'KING', 'NOVA CERAM', 'OPERA CERAM',
            'SANI DECOR', 'SCS', 'شلغوم العيد'
        ];

        console.log('--- Family Matches ---');

        let totalKept = 0;
        for (const family of families) {
            // Check Brands, Categories, and ProductName
            const query = `
                SELECT COUNT(*) FROM Products p
                LEFT JOIN Brands b ON p.BrandID = b.BrandID
                LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
                WHERE 
                    p.ProductName ILIKE $1 OR 
                    b.BrandName ILIKE $1 OR 
                    c.CategoryName ILIKE $1
            `;
            const result = await client.query(query, [`%${family}%`]);
            const count = parseInt(result.rows[0].count, 10);
            console.log(`${family.padEnd(20)}: ${count} products`);
            totalKept += count;
        }

        // Just to ensure not double counting, get distinct count:
        const conditions = families.map((_, i) =>
            `(p.ProductName ILIKE $${i + 1} OR b.BrandName ILIKE $${i + 1} OR c.CategoryName ILIKE $${i + 1})`
        ).join(' OR ');

        const distinctQuery = `
            SELECT COUNT(*) FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            WHERE ${conditions}
        `;

        const params = families.map(f => `%${f}%`);
        const distinctResult = await client.query(distinctQuery, params);

        console.log(`\nTotal Distinct Products Kept: ${distinctResult.rows[0].count}`);

        const allProducts = await client.query('SELECT COUNT(*) FROM Products');
        console.log(`Total Products in DB       : ${allProducts.rows[0].count}`);
        console.log(`Products to be Deleted     : ${parseInt(allProducts.rows[0].count) - parseInt(distinctResult.rows[0].count)}`);

        client.release();
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkFamilies();

require('dotenv').config();
const pool = require('./src/config/database');

async function checkFilters() {
    try {
        const client = await pool.connect();

        console.log('--- Product Filter Analysis ---');

        // Total products
        const total = await client.query('SELECT COUNT(*) FROM Products');
        console.log(`Total Products in DB: ${total.rows[0].count}`);

        // 1. Starts with FICHE
        const fiche = await client.query(`SELECT COUNT(*) FROM Products WHERE ProductName ILIKE 'FICHE%' OR ProductCode ILIKE 'FICHE%'`);
        console.log(`Products starting with FICHE: ${fiche.rows[0].count}`);

        // 2. Monocouche products (assuming category or name)
        const monocouche = await client.query(`
            SELECT COUNT(*) FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            WHERE p.ProductName ILIKE '%monocouche%' OR c.CategoryName ILIKE '%monocouche%'
        `);
        console.log(`Monocouche products: ${monocouche.rows[0].count}`);

        // 3. Sold by piece sanitary products
        // Category like 'Sanitaire', Unit like 'PCS' or 'Piece'
        const sanitaire = await client.query(`
            SELECT COUNT(*) FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
            WHERE c.CategoryName ILIKE '%Sanitaire%' AND (u.UnitCode ILIKE '%PCS%' OR u.UnitName ILIKE '%Piece%')
        `);
        console.log(`Sanitaire (by piece) products: ${sanitaire.rows[0].count}`);

        // 4. Puma products (brand or name)
        const puma = await client.query(`
            SELECT COUNT(*) FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            WHERE p.ProductName ILIKE '%puma%' OR b.BrandName ILIKE '%puma%'
        `);
        console.log(`Puma products: ${puma.rows[0].count}`);

        // Combined kept products
        const keepQuery = `
            SELECT p.ProductID, p.ProductCode, p.ProductName, c.CategoryName, b.BrandName, u.UnitCode
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
            WHERE 
                (p.ProductName ILIKE 'FICHE%' OR p.ProductCode ILIKE 'FICHE%') OR
                (p.ProductName ILIKE '%monocouche%' OR c.CategoryName ILIKE '%monocouche%') OR
                (c.CategoryName ILIKE '%Sanitaire%' AND (u.UnitCode ILIKE '%PCS%' OR u.UnitName ILIKE '%Piece%')) OR
                (p.ProductName ILIKE '%puma%' OR b.BrandName ILIKE '%puma%')
        `;

        const kept = await client.query(keepQuery);
        console.log(`\nTotal products that would be KEPT: ${kept.rows.length}`);
        console.log(`Total products that would be DELETED: ${total.rows[0].count - kept.rows.length}`);

        client.release();
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkFilters();

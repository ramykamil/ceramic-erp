const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function addBrand() {
    const brandName = process.argv[2];

    if (!brandName) {
        console.error('Please provide a brand name. Usage: node add_brand.js "Brand Name"');
        process.exit(1);
    }

    const client = await pool.connect();
    try {
        console.log(`Adding brand: ${brandName}...`);

        // simple insert
        const res = await client.query(
            'INSERT INTO Brands (BrandName) VALUES ($1) RETURNING *',
            [brandName]
        );

        console.log('Brand added successfully:');
        console.table(res.rows[0]);

    } catch (err) {
        console.error('Error adding brand:', err);
    } finally {
        client.release();
        pool.end();
    }
}

addBrand();

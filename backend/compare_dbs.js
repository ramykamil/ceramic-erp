require('dotenv').config();
const { Pool } = require('pg');

// Local DB
const localPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Cloud DB
const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function compare() {
    try {
        console.log('Fetching local products...');
        const localRes = await localPool.query(`
      SELECT ProductID, ProductName, IsActive FROM Products WHERE IsActive = true ORDER BY ProductID
    `);
        console.log(`Local: ${localRes.rows.length} active products`);

        console.log('Fetching cloud products...');
        const cloudRes = await cloudPool.query(`
      SELECT ProductID, ProductName, IsActive FROM Products WHERE IsActive = true ORDER BY ProductID
    `);
        console.log(`Cloud: ${cloudRes.rows.length} active products`);

        // Build maps
        const localMap = new Map();
        localRes.rows.forEach(r => localMap.set(r.productid, r.productname));
        const cloudMap = new Map();
        cloudRes.rows.forEach(r => cloudMap.set(r.productid, r.productname));

        // Find mismatches
        const missingOnCloud = [];
        const nameChanged = [];

        for (const [id, name] of localMap) {
            if (!cloudMap.has(id)) {
                missingOnCloud.push({ id, name });
            } else if (cloudMap.get(id) !== name) {
                nameChanged.push({ id, localName: name, cloudName: cloudMap.get(id) });
            }
        }

        const missingOnLocal = [];
        for (const [id, name] of cloudMap) {
            if (!localMap.has(id)) {
                missingOnLocal.push({ id, name });
            }
        }

        console.log(`\n=== PRODUCTS IN LOCAL BUT MISSING ON CLOUD: ${missingOnCloud.length} ===`);
        missingOnCloud.forEach(p => console.log(`  [${p.id}] ${p.name}`));

        console.log(`\n=== PRODUCTS WITH NAME CHANGES: ${nameChanged.length} ===`);
        nameChanged.forEach(p => console.log(`  [${p.id}] LOCAL: "${p.localName}" → CLOUD: "${p.cloudName}"`));

        console.log(`\n=== PRODUCTS ON CLOUD BUT NOT LOCAL: ${missingOnLocal.length} ===`);
        missingOnLocal.forEach(p => console.log(`  [${p.id}] ${p.name}`));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        localPool.end();
        cloudPool.end();
    }
}

compare();

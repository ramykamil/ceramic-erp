const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudUrl = process.env.CLOUD_DB_URL || "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";

const pool = new Pool({
    connectionString: cloudUrl,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const filePath = path.join(__dirname, 'fixed_brands.json');
    if (!fs.existsSync(filePath)) {
        console.error("fixed_brands.json not found!");
        process.exit(1);
    }

    const validBrands = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`Starting to restore BrandIDs for ${validBrands.length} products on the Cloud DB...`);

    const client = await pool.connect();
    let updatedCount = 0;

    try {
        await client.query('BEGIN');

        // Batch updates for performance
        for (let i = 0; i < validBrands.length; i++) {
            const p = validBrands[i];
            // Update by ProductCode since ProductID might have shifted if the sequences changed (though they shouldn't have)
            const res = await client.query(
                'UPDATE Products SET BrandID = $1 WHERE ProductCode = $2 AND BrandID IS NULL',
                [p.brandid, p.productcode]
            );

            if (res.rowCount > 0) {
                updatedCount += res.rowCount;
            }

            if (i % 100 === 0 && i !== 0) {
                console.log(`Processed ${i} / ${validBrands.length}...`);
            }
        }

        await client.query('COMMIT');

        // Refresh materialized view on the cloud
        console.log("Refreshing mv_Catalogue on the cloud...");
        try {
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        } catch (err) {
            console.warn("Could not refresh mv_Catalogue. Perhaps it doesn't exist yet or is throwing an error:", err.message);
        }

        console.log(`✅ Successfully restored BrandID for ${updatedCount} products in the Cloud Database!`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error during update:", err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

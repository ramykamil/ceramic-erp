/**
 * Migration Script: Create Factories from Brands
 * 
 * This script creates a Factory record for each Brand in the database.
 * It also links each Brand to its corresponding Factory via FactoryID.
 * 
 * Run with: node src/scripts/create_factories_from_brands.js
 */

const pool = require('../config/database');

async function createFactoriesFromBrands() {
    const client = await pool.connect();

    try {
        console.log('=== Creating Factories from Brands ===\n');
        await client.query('BEGIN');

        // 1. Ensure FactoryID column exists in Brands table
        console.log('Step 1: Ensuring FactoryID column exists in Brands...');
        await client.query(`
            ALTER TABLE Brands 
            ADD COLUMN IF NOT EXISTS FactoryID INTEGER REFERENCES Factories(FactoryID);
        `);
        console.log('✓ FactoryID column ready\n');

        // 2. Get all brands
        const brandsResult = await client.query(`
            SELECT BrandID, BrandName, Description, IsActive 
            FROM Brands 
            ORDER BY BrandName
        `);
        console.log(`Step 2: Found ${brandsResult.rows.length} brands to process\n`);

        // 3. For each brand, create or update a factory
        let created = 0;
        let updated = 0;
        let linked = 0;

        for (const brand of brandsResult.rows) {
            // Generate a factory code from brand name
            const factoryCode = `FAC-${brand.brandname.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase()}`;

            // Check if factory already exists for this brand
            const existingFactory = await client.query(`
                SELECT FactoryID FROM Factories WHERE FactoryCode = $1
            `, [factoryCode]);

            let factoryId;

            if (existingFactory.rows.length > 0) {
                // Factory exists, update it
                factoryId = existingFactory.rows[0].factoryid;
                await client.query(`
                    UPDATE Factories 
                    SET FactoryName = $1, IsActive = $2, UpdatedAt = CURRENT_TIMESTAMP
                    WHERE FactoryID = $3
                `, [brand.brandname, brand.isactive, factoryId]);
                updated++;
                console.log(`  📝 Updated factory: ${brand.brandname} (ID: ${factoryId})`);
            } else {
                // Create new factory
                const insertResult = await client.query(`
                    INSERT INTO Factories (FactoryCode, FactoryName, IsActive)
                    VALUES ($1, $2, $3)
                    RETURNING FactoryID
                `, [factoryCode, brand.brandname, brand.isactive]);
                factoryId = insertResult.rows[0].factoryid;
                created++;
                console.log(`  ✅ Created factory: ${brand.brandname} (ID: ${factoryId})`);
            }

            // 4. Link brand to factory
            const linkResult = await client.query(`
                UPDATE Brands 
                SET FactoryID = $1, UpdatedAt = CURRENT_TIMESTAMP
                WHERE BrandID = $2 AND (FactoryID IS NULL OR FactoryID != $1)
                RETURNING BrandID
            `, [factoryId, brand.brandid]);

            if (linkResult.rows.length > 0) {
                linked++;
            }
        }

        await client.query('COMMIT');

        console.log('\n=== Summary ===');
        console.log(`Factories created: ${created}`);
        console.log(`Factories updated: ${updated}`);
        console.log(`Brands linked: ${linked}`);
        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the migration
createFactoriesFromBrands();

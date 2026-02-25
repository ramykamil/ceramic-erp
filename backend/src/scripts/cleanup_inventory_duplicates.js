const pool = require('../config/database');

async function cleanupInventoryAndDuplicates() {
    const client = await pool.connect();

    try {
        console.log('Starting Cleanup Process...');
        await client.query('BEGIN');

        // 1. Fix Negative Inventory (QuantityOnHand)
        console.log('\n--- Step 1: Fixing Negative Quantity On Hand ---');

        // Check for negative QuantityOnHand
        const negHandQuery = await client.query('SELECT count(*) FROM Inventory WHERE QuantityOnHand < 0');
        console.log(`Found ${negHandQuery.rows[0].count} items with negative QuantityOnHand.`);

        const updateInventoryResult = await client.query(`
      UPDATE Inventory 
      SET QuantityOnHand = 0, UpdatedAt = CURRENT_TIMESTAMP
      WHERE QuantityOnHand < 0
    `);
        if (updateInventoryResult.rowCount > 0) {
            console.log(`✓ Updated ${updateInventoryResult.rowCount} inventory records with negative quantities to 0.`);
        }

        // 2. Fix Negative Availability (QuantityReserved > QuantityOnHand)
        // The user wants to "fix negative values". If Available < 0, it means Reserved > OnHand.
        // We will reset QuantityReserved to 0 for these items to make Available = OnHand (which is >= 0).
        console.log('\n--- Step 2: Fixing Negative Availability (Reserved > On Hand) ---');

        const negAvailableQuery = await client.query(`
        SELECT count(*) FROM Inventory 
        WHERE (QuantityOnHand - QuantityReserved) < 0
    `);
        console.log(`Found ${negAvailableQuery.rows[0].count} items with negative Availability (Reserved > OnHand).`);

        const updateReservedResult = await client.query(`
        UPDATE Inventory 
        SET QuantityReserved = 0, UpdatedAt = CURRENT_TIMESTAMP
        WHERE (QuantityOnHand - QuantityReserved) < 0
    `);

        if (updateReservedResult.rowCount > 0) {
            console.log(`✓ Reset QuantityReserved to 0 for ${updateReservedResult.rowCount} items to fix negative availability.`);
        }

        // 3. Identify and Handle Duplicate Products (Case Insensitive)
        console.log('\n--- Step 3: Handling Duplicate Products (Case Insensitive Trimming) ---');

        // Find duplicates (same name normalized, active)
        const duplicatesQuery = `
      SELECT LOWER(TRIM(ProductName)) as normalized_name, COUNT(*) as count
      FROM Products
      WHERE IsActive = true
      GROUP BY LOWER(TRIM(ProductName))
      HAVING COUNT(*) > 1
    `;
        const duplicatesResult = await client.query(duplicatesQuery);
        console.log(`Found ${duplicatesResult.rowCount} sets of duplicate products (by normalized name).`);

        for (const row of duplicatesResult.rows) {
            const normalizedName = row.normalized_name;
            console.log(`\nProcessing duplicates for: "${normalizedName}"`);

            // Get all instances of this product, ordered by ID DESC (latest first)
            const productsQuery = `
        SELECT ProductID, ProductCode, ProductName, CreatedAt
        FROM Products
        WHERE LOWER(TRIM(ProductName)) = $1 AND IsActive = true
        ORDER BY ProductID DESC
      `;
            const productsResult = await client.query(productsQuery, [normalizedName]);
            const products = productsResult.rows;

            if (products.length < 2) continue;

            const keeper = products[0]; // Keep the most recent one
            const duplicates = products.slice(1); // The rest are duplicates to archive

            console.log(`  Keeping: [${keeper.productid}] ${keeper.productcode} ("${keeper.productname}")`);

            for (const duplicate of duplicates) {
                // Archive duplicate
                const newCode = `${duplicate.productcode}_ARCHIVED_${duplicate.productid}`;
                // Verify name doesn't already have archived tag to avoid double processing if run multiple times
                if (duplicate.productname.includes('_ARCHIVED_')) continue;

                const newName = `${duplicate.productname}_ARCHIVED_${duplicate.productid}`;

                console.log(`  Archiving: [${duplicate.productid}] ${duplicate.productcode} -> ${newCode}`);

                await client.query(`
          UPDATE Products
          SET IsActive = false,
              ProductCode = $1,
              ProductName = $2,
              UpdatedAt = CURRENT_TIMESTAMP
          WHERE ProductID = $3
        `, [newCode, newName, duplicate.productid]);
            }
        }

        await client.query('COMMIT');
        console.log('\n--- Cleanup Successfully Completed ---');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n!!! Error during cleanup:', error);
    } finally {
        client.release();
        pool.end();
    }
}

cleanupInventoryAndDuplicates();

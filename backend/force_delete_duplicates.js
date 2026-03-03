require('dotenv').config();
const { Client } = require('pg');

const DB_URL = "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";

async function forceDeleteOldProducts() {
    const client = new Client({
        connectionString: DB_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000
    });

    try {
        await client.connect();
        console.log('--- PHASE 4: FORCEFUL CLEANUP OF ALL UNRECOGNIZED PRODUCTS ---');

        // 1. Get the Keep List Families
        const keepKeywords = [
            'FICHE', 'motif', 'ALLAOUA CERAM', 'ANDALOUS CERAM', 'BELLA CERAM',
            'CERAM BOUMERDAS', 'CERAM GLASS', 'CERAMIQUE CHARK', 'EL ATHMANIA',
            'ELNOURASSI', 'F CERAM', 'GRUPOPUMA', 'KING', 'NOVA CERAM',
            'OPERA CERAM', 'SANI DECOR', 'SCS', 'شلغوم العيد'
        ];

        // We want to KEEP the New Master Products.
        // We know exactly what the New Master Products are because they were uploaded today (with the highest IDs)
        // Let's identify the starting ProductID of our new import. It's roughly the last 1501 products inserted.
        // Even safer: We group all products by exact name, and we define the HIGHEST ProductID of each name as the "Master".

        await client.query('BEGIN');

        console.log('Fetching all products...');
        const allProductsRes = await client.query('SELECT ProductID, ProductName FROM Products');
        const allProducts = allProductsRes.rows;

        const groups = {};
        for (const p of allProducts) {
            const key = p.productname.trim().toUpperCase();
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        }

        let deletionIds = [];
        let skippedIds = [];

        // Loop through all names
        for (const [name, products] of Object.entries(groups)) {
            // Sort to find the "Master" (the one with the highest ID = newest)
            products.sort((a, b) => b.productid - a.productid);
            const master = products[0];

            // If the name is strictly exactly in the keepKeywords list or contains them, KEEP ALL OF THEM to be safe
            const isKeepList = keepKeywords.some(kw => name.includes(kw.toUpperCase()));

            if (isKeepList) {
                // Keep everything in this group
                skippedIds.push(...products.map(p => p.productid));
                continue;
            }

            // For all other products, Keep the Master (index 0) and Delete the rest (index 1 to end)
            const duplicates = products.slice(1);
            for (const dup of duplicates) {
                deletionIds.push(dup.productid);
            }
        }

        console.log(`Identified ${deletionIds.length} obsolete products to forcibly delete.`);
        console.log(`Keeping ${skippedIds.length} Keep-List products and ${Object.keys(groups).length - skippedIds.length} Master products.`);

        if (deletionIds.length === 0) {
            console.log('No more duplicates to delete!');
            await client.query('ROLLBACK');
            return;
        }

        // FORCE DELETE EVERYTHING RELATED TO THESE IDs
        console.log('Wiping all history for doomed products...');

        // Disable foreign key checks for the session if we can, or just delete in order.
        // We delete in order to satisfy FK constraints:
        const tablesToClear = [
            'OrderItems',
            'PurchaseOrderItems',
            'GoodsReceiptItems',
            'ReturnItems',
            'InventoryTransactions',
            'Inventory',
            'CustomerProductPrices',
            'ProductUnits',
            'BuyingPrices',
            'PriceListItems',
            'SettlementItems'
        ];

        // Execute batch deletes in chunks of 500 to avoid query string limits
        for (let i = 0; i < deletionIds.length; i += 500) {
            const chunk = deletionIds.slice(i, i + 500);
            console.log(`Wiping dependencies for chunk ${i} to ${i + chunk.length}...`);

            for (const table of tablesToClear) {
                try {
                    await client.query(`DELETE FROM ${table} WHERE ProductID = ANY($1)`, [chunk]);
                } catch (e) { /* Ignore if table doesn't exist */ }
            }

            // Also check InvoiceItems just in case
            try {
                await client.query(`DELETE FROM InvoiceItems WHERE ProductID = ANY($1)`, [chunk]);
            } catch (e) { }

            console.log(`Deleting chunk from Products...`);
            await client.query(`DELETE FROM Products WHERE ProductID = ANY($1)`, [chunk]);
        }

        await client.query('COMMIT');
        console.log(`--- FORCE CLEANUP COMPLETE. ${deletionIds.length} duplicates and their histories were permanently deleted. ---`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during Force Cleanup:', err);
    } finally {
        await client.end();
    }
}

forceDeleteOldProducts();

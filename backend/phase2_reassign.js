/**
 * Phase 2 & 3: Reassign History & Delete Old
 * This script identifies products to be deleted, finds their exact matching "Master" product,
 * moves all their sales/purchase history over, and then deletes the old duplicate.
 */

require('dotenv').config();
const pool = require('./src/config/database');

// Helper for exact or clean matching
function normalizeString(str) {
    if (!str) return '';
    return str.toString()
        .toLowerCase()
        // remove extra spaces and common symbols that might cause a mismatch
        .replace(/[^a-z0-9]/g, '');
}

// Distance matching if needed
function levenshteinDistance(s, t) {
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    const arr = [];
    for (let i = 0; i <= t.length; i++) {
        arr[i] = [i];
        for (let j = 1; j <= s.length; j++) {
            arr[1] = j;
        }
    }
    return arr[t.length][s.length]; // Simplified, we probably just want exact/starts with for now to be safe
}

async function reassignAndDelete() {
    const client = await pool.connect();

    try {
        console.log('--- PHASE 2: MAPPING & REASSIGNING HISTORY ---');
        await client.query('BEGIN');

        // 1. Get the Keep List Families (SQL conditions)
        const keepKeywords = [
            'FICHE', 'motif', 'ALLAOUA CERAM', 'ANDALOUS CERAM', 'BELLA CERAM',
            'CERAM BOUMERDAS', 'CERAM GLASS', 'CERAMIQUE CHARK', 'EL ATHMANIA',
            'ELNOURASSI', 'F CERAM', 'GRUPOPUMA', 'KING', 'NOVA CERAM',
            'OPERA CERAM', 'SANI DECOR', 'SCS', 'شلغوم العيد'
        ];

        // 2. Identify the Master Products (The 1501 we just imported/verified)
        // Since we know the master list was just updated, we can pull all active products, 
        // or we can just fetch ALL products and use name matching.
        const allProductsRes = await client.query(`
            SELECT p.ProductID, p.ProductName, p.ProductCode, c.CategoryName, b.BrandName 
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
        `);
        const allProducts = allProductsRes.rows;

        // Separate into "Keep" (Master + Families) and "Delete" lists
        const masterNames = new Set();
        // Since we don't have a direct flag for the 1501, we will identify the Master by taking 
        // the one with the MOST recent UpdatedAt or just grouping by normalized name and picking the max ID as master.
        // Actually, let's group by name. Since we just ran Phase 1, the Master is the one that is currently active and recently updated.

        console.log(`Analyzing ${allProducts.length} total products in database...`);

        // Group by exact name
        const groups = {};
        for (const p of allProducts) {
            const key = p.productname.trim().toUpperCase();
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        }

        let operationsExecuted = 0;
        let deletedCount = 0;

        for (const [name, products] of Object.entries(groups)) {
            if (products.length <= 1) {
                // No duplicates for this exact name.
                // Is it in the keep list?
                const p = products[0];
                const isKeep = keepKeywords.some(kw =>
                    p.productname.toLowerCase().includes(kw.toLowerCase()) ||
                    (p.brandname && p.brandname.toLowerCase().includes(kw.toLowerCase())) ||
                    (p.categoryname && p.categoryname.toLowerCase().includes(kw.toLowerCase()))
                );

                if (!isKeep) {
                    // It's a single product, NOT in the keep list, NOT in the master excel list (if it was, it would be the master).
                    // Wait, if it's in the Excel list, it would have been updated. 
                    // Let's check history. If it has no history, we can delete it. If it has history, we are stuck unless we map it.
                    // We only want to delete things safely.
                }
                continue;
            }

            // We have duplicates!
            // Assume the Master is the highest ProductID (since new ones were just inserted, or we trust the one that exists)
            // Or better, the one where IsActive = true if we deactivated others previously.
            products.sort((a, b) => b.productid - a.productid);
            const master = products[0]; // Highest ID as master
            const duplicates = products.slice(1);

            for (const dup of duplicates) {
                const oldId = dup.productid;
                const newId = master.productid;

                // 1. Move OrderItems
                await client.query('UPDATE OrderItems SET ProductID = $1 WHERE ProductID = $2', [newId, oldId]);

                // 2. Move PurchaseOrderItems
                await client.query('UPDATE PurchaseOrderItems SET ProductID = $1 WHERE ProductID = $2', [newId, oldId]);

                // 3. Move ReturnItems
                await client.query('UPDATE ReturnItems SET ProductID = $1 WHERE ProductID = $2', [newId, oldId]);

                // 4. Note: We DO NOT move InventoryTransactions because we are going to overwrite stock quantities from Excel anyway in Phase 3.
                // However, to physically DELETE the duplicate product, we MUST delete its InventoryTransactions.
                await client.query('DELETE FROM InventoryTransactions WHERE ProductID = $1', [oldId]);
                await client.query('DELETE FROM Inventory WHERE ProductID = $1', [oldId]);

                // Also remove from CustomerProductPrices if they exist
                await client.query('DELETE FROM CustomerProductPrices WHERE ProductID = $1', [oldId]);

                // Also remove from ProductUnits
                await client.query('DELETE FROM ProductUnits WHERE ProductID = $1', [oldId]);

                // 5. Delete the duplicate product
                await client.query('DELETE FROM Products WHERE ProductID = $1', [oldId]);

                deletedCount++;
                operationsExecuted++;
            }
        }

        // Now, what about products that have slightly different names but are duplicates?
        // We will do a generic pass: Delete any product that has NO history, NO inventory, and is NOT in keep list.
        console.log('Cleaning up unused, obsolete products with no history...');
        const cleanupRes = await client.query(`
            DELETE FROM Products p
            WHERE NOT EXISTS (SELECT 1 FROM OrderItems oi WHERE oi.ProductID = p.ProductID)
            AND NOT EXISTS (SELECT 1 FROM PurchaseOrderItems pi WHERE pi.ProductID = p.ProductID)
            AND NOT EXISTS (SELECT 1 FROM InventoryTransactions it WHERE it.ProductID = p.ProductID)
            AND NOT EXISTS (
                SELECT 1 FROM unnest($1::text[]) kw 
                WHERE p.ProductName ILIKE '%' || kw || '%'
            )
            RETURNING ProductID;
        `, [keepKeywords]);

        console.log(`Cleaned up ${cleanupRes.rowCount} empty products.`);

        await client.query('COMMIT');
        console.log('--- PHASE 2 & 3 COMPLETE ---');
        console.log(`Merged and safely deleted ${deletedCount} direct duplicates by swapping history.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during Reassignment:', err);
    } finally {
        client.release();
        pool.end();
    }
}

reassignAndDelete();

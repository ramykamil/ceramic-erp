/**
 * Phase 2 & 3: Reassign History & Delete Old (DIRECT UPLOAD VERSION)
 * Maps old products to Master products, reassigns their history, and deletes them.
 */

require('dotenv').config();
const { Client } = require('pg');

const DB_URL = "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";

async function reassignAndDelete() {
    const client = new Client({
        connectionString: DB_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000
    });

    try {
        await client.connect();
        console.log('--- PHASE 2: MAPPING & REASSIGNING HISTORY (CLOUD DIRECT) ---');

        // 1. Get the Keep List Families
        const keepKeywords = [
            'FICHE', 'motif', 'ALLAOUA CERAM', 'ANDALOUS CERAM', 'BELLA CERAM',
            'CERAM BOUMERDAS', 'CERAM GLASS', 'CERAMIQUE CHARK', 'EL ATHMANIA',
            'ELNOURASSI', 'F CERAM', 'GRUPOPUMA', 'KING', 'NOVA CERAM',
            'OPERA CERAM', 'SANI DECOR', 'SCS', 'شلغوم العيد'
        ];

        // 2. Fetch all products
        const allProductsRes = await client.query(`
            SELECT p.ProductID, p.ProductName, p.ProductCode, c.CategoryName, b.BrandName 
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
        `);
        const allProducts = allProductsRes.rows;

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
            if (products.length <= 1) continue;

            // Sort by ProductID desc so the latest (Master) is first
            products.sort((a, b) => b.productid - a.productid);
            const master = products[0];
            const duplicates = products.slice(1);

            for (const dup of duplicates) {
                const oldId = dup.productid;
                const newId = master.productid;

                try {
                    await client.query('BEGIN');

                    // Move constraints
                    await client.query('UPDATE OrderItems SET ProductID = $1 WHERE ProductID = $2', [newId, oldId]);
                    await client.query('UPDATE PurchaseOrderItems SET ProductID = $1 WHERE ProductID = $2', [newId, oldId]);
                    await client.query('UPDATE ReturnItems SET ProductID = $1 WHERE ProductID = $2', [newId, oldId]);
                    await client.query('UPDATE GoodsReceiptItems SET ProductID = $1 WHERE ProductID = $2', [newId, oldId]);

                    // Clear inventory and related tables for the duplicate
                    await client.query('DELETE FROM InventoryTransactions WHERE ProductID = $1', [oldId]);
                    await client.query('DELETE FROM Inventory WHERE ProductID = $1', [oldId]);
                    await client.query('DELETE FROM CustomerProductPrices WHERE ProductID = $1', [oldId]);
                    await client.query('DELETE FROM ProductUnits WHERE ProductID = $1', [oldId]);
                    await client.query('DELETE FROM BuyingPrices WHERE ProductID = $1', [oldId]);
                    await client.query('DELETE FROM PriceListItems WHERE ProductID = $1', [oldId]);
                    await client.query('DELETE FROM SettlementItems WHERE ProductID = $1', [oldId]);

                    // Delete the duplicate product
                    await client.query('DELETE FROM Products WHERE ProductID = $1', [oldId]);

                    await client.query('COMMIT');
                    deletedCount++;
                    operationsExecuted++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.log(`Skipped mapping/deleting ProductID ${oldId} due to constraint: ${err.message}`);
                }
            }
        }

        console.log('Cleaning up unused, obsolete products with no history...');

        // Find exactly which products we are going to delete
        const obsoleteProductsRes = await client.query(`
            SELECT ProductID FROM Products p
            WHERE NOT EXISTS (SELECT 1 FROM OrderItems oi WHERE oi.ProductID = p.ProductID)
            AND NOT EXISTS (SELECT 1 FROM PurchaseOrderItems pi WHERE pi.ProductID = p.ProductID)
            AND NOT EXISTS (SELECT 1 FROM GoodsReceiptItems gi WHERE gi.ProductID = p.ProductID)
            AND NOT EXISTS (SELECT 1 FROM InventoryTransactions it WHERE it.ProductID = p.ProductID)
            AND NOT EXISTS (SELECT 1 FROM ReturnItems ri WHERE ri.ProductID = p.ProductID)
            AND NOT EXISTS (
                SELECT 1 FROM unnest($1::text[]) kw 
                WHERE p.ProductName ILIKE '%' || kw || '%'
            )
        `, [keepKeywords]);

        const obsoleteIds = obsoleteProductsRes.rows.map(r => r.productid);

        if (obsoleteIds.length > 0) {
            // Clear their foreign key dependencies first
            await client.query('DELETE FROM Inventory WHERE ProductID = ANY($1)', [obsoleteIds]);
            await client.query('DELETE FROM CustomerProductPrices WHERE ProductID = ANY($1)', [obsoleteIds]);
            await client.query('DELETE FROM ProductUnits WHERE ProductID = ANY($1)', [obsoleteIds]);
            await client.query('DELETE FROM BuyingPrices WHERE ProductID = ANY($1)', [obsoleteIds]);
            await client.query('DELETE FROM PriceListItems WHERE ProductID = ANY($1)', [obsoleteIds]);
            await client.query('DELETE FROM SettlementItems WHERE ProductID = ANY($1)', [obsoleteIds]);

            // Now safely delete them
            const cleanupRes = await client.query('DELETE FROM Products WHERE ProductID = ANY($1) RETURNING ProductID', [obsoleteIds]);
            console.log(`Cleaned up ${cleanupRes.rowCount} empty obsolete products.`);
        } else {
            console.log(`Cleaned up 0 empty products.`);
        }

        console.log('--- PHASE 2 & 3 COMPLETE ---');
        console.log(`Merged and safely deleted ${deletedCount} direct duplicates by swapping history.`);

    } catch (err) {
        console.error('Error during Reassignment Setup:', err);
    } finally {
        await client.end();
    }
}

reassignAndDelete();

const pool = require('../backend/src/config/database');

async function findBaselines() {
    try {
        const res = await pool.query(`
            SELECT it.TransactionID, it.ProductID, p.ProductName, it.Quantity, it.CreatedAt, it.Notes
            FROM InventoryTransactions it 
            JOIN Products p ON it.ProductID = p.ProductID 
            WHERE it.Notes = 'Sync update' 
              AND it.CreatedAt >= '2026-04-07 00:00:00' 
              AND it.CreatedAt < '2026-04-07 06:00:00'
        `);
        console.log(`Found ${res.rows.length} products with "Sync update" baseline.`);
        console.log(JSON.stringify(res.rows.slice(0, 5), null, 2));

        // Check Brooklyn example specifically
        const brooklyn = res.rows.find(r => r.productname.includes('BROOKLYNE BEIGE 45/45'));
        if (brooklyn) {
            console.log("\nBrooklyn Beige Example:");
            console.log(JSON.stringify(brooklyn, null, 2));
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

findBaselines();

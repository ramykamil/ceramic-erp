require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
    const client = await pool.connect();
    try {
        console.log('=== PRODUCTS WITH MANUAL ADJUSTMENTS (AFFECTED BY GR BUG) ===\n');

        // Query to find products that had GoodsReceipts AND manual adjustments 
        // We filter out IMPORT_CSV and our recent automatic bulk fix today
        const query = `
            WITH gr_products AS (
                SELECT DISTINCT productid FROM GoodsReceiptItems
            ),
            manual_adjs AS (
                SELECT 
                    it.productid,
                    COUNT(it.transactionid) as num_adjustments,
                    SUM(it.quantity) as net_adj_quantity,
                    MIN(it.createdat) as first_adj_date,
                    MAX(it.createdat) as last_adj_date,
                    STRING_AGG(DISTINCT SUBSTRING(it.notes, 1, 50), ' || ') as sample_notes
                FROM InventoryTransactions it
                JOIN gr_products gp ON it.productid = gp.productid
                WHERE it.transactiontype = 'ADJUSTMENT' 
                  AND it.referencetype != 'IMPORT_CSV'
                  -- Exclude our automated fixes from today: "Fix: Recalculated from Import..." and "Fix: GoodsReceipt unit..."
                  AND (it.notes IS NULL OR it.notes NOT LIKE 'Fix: %')
                  -- Exclude the bulk formula fix from yesterday: "Bulk fix: Recalculated from GoodsReceipts minus Sales"
                  AND (it.notes IS NULL OR it.notes NOT LIKE 'Bulk fix: %')
                GROUP BY it.productid
            )
            SELECT 
                p.productid,
                p.productname,
                ma.num_adjustments,
                ma.net_adj_quantity,
                ma.first_adj_date,
                ma.last_adj_date,
                ma.sample_notes
            FROM Products p
            JOIN manual_adjs ma ON p.productid = ma.productid
            ORDER BY ABS(ma.net_adj_quantity) DESC;
        `;

        const result = await client.query(query);

        if (result.rows.length === 0) {
            console.log("No manual adjustments found for GR-affected products.");
        } else {
            console.log(`Found ${result.rows.length} products with GoodsReceipts that also had manual adjustments:\n`);

            for (const row of result.rows) {
                console.log(`[ID: ${row.productid}] ${row.productname}`);
                console.log(`  Adjustments: ${row.num_adjustments} | Total Net Qty: ${parseFloat(row.net_adj_quantity).toFixed(2)}`);
                console.log(`  Dates: ${row.first_adj_date} to ${row.last_adj_date}`);
                console.log(`  Notes: ${row.sample_notes}`);
                console.log('');
            }
        }

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        client.release();
        pool.end();
    }
})();

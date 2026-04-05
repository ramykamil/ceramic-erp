require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
    const c = await pool.connect();
    try {
        const parseDimensions = (str) => {
            if (!str) return 0;
            const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
            if (match) return (parseInt(match[1]) * parseInt(match[2])) / 10000;
            return 0;
        };

        // Check ALL products with GoodsReceipts using the CORRECT formula:
        // Expected = Initial_Import + GR_Received_Correct - Confirmed_Sales + Manual_Adj
        const query = `
            WITH gr_totals AS (
                SELECT gri.productid, SUM(gri.quantityreceived) as total_received
                FROM GoodsReceiptItems gri
                GROUP BY gri.productid
            ),
            import_totals AS (
                SELECT productid, SUM(quantity) as import_qty
                FROM InventoryTransactions
                WHERE referencetype = 'IMPORT_CSV'
                GROUP BY productid
            ),
            confirmed_sales AS (
                SELECT oi.productid, SUM(oi.quantity) as total_sold
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE o.status IN ('CONFIRMED', 'DELIVERED')
                GROUP BY oi.productid
            ),
            manual_adj AS (
                SELECT productid, SUM(quantity) as total_adj
                FROM InventoryTransactions
                WHERE transactiontype = 'ADJUSTMENT' AND referencetype NOT IN ('IMPORT_CSV')
                GROUP BY productid
            ),
            current_inv AS (
                SELECT productid, SUM(quantityonhand) as current_qty
                FROM Inventory WHERE ownershiptype = 'OWNED'
                GROUP BY productid
            )
            SELECT 
                p.productid, p.productname, p.size,
                pu.unitcode as primary_unit,
                COALESCE(gr.total_received, 0) as gr_received,
                COALESCE(imp.import_qty, 0) as import_qty,
                COALESCE(cs.total_sold, 0) as confirmed_sold,
                COALESCE(ma.total_adj, 0) as manual_adj,
                COALESCE(ci.current_qty, 0) as current_qty,
                (COALESCE(imp.import_qty, 0) + COALESCE(gr.total_received, 0) - COALESCE(cs.total_sold, 0) + COALESCE(ma.total_adj, 0)) as expected_full
            FROM Products p
            LEFT JOIN Units pu ON p.primaryunitid = pu.unitid
            JOIN gr_totals gr ON p.productid = gr.productid
            LEFT JOIN import_totals imp ON p.productid = imp.productid
            LEFT JOIN confirmed_sales cs ON p.productid = cs.productid
            LEFT JOIN manual_adj ma ON p.productid = ma.productid
            LEFT JOIN current_inv ci ON p.productid = ci.productid
            WHERE p.isactive = true
            ORDER BY ABS(COALESCE(ci.current_qty, 0) - (COALESCE(imp.import_qty, 0) + COALESCE(gr.total_received, 0) - COALESCE(cs.total_sold, 0) + COALESCE(ma.total_adj, 0))) DESC
        `;

        const result = await c.query(query);

        console.log('=== POST-FIX CHECK: GR Products with Full Formula ===');
        console.log('Formula: Expected = Import + GR_Received - Confirmed_Sales + Manual_Adj\n');

        let discrepancies = [];
        let matches = 0;

        for (const row of result.rows) {
            const current = parseFloat(row.current_qty);
            const expected = parseFloat(row.expected_full);
            const diff = current - expected;

            if (Math.abs(diff) > 0.5) {
                discrepancies.push(row);
                const sqm = parseDimensions(row.size || row.productname);
                console.log(`[${row.productid}] ${row.productname} (PrimaryUnit: ${row.primary_unit}, sqm/pcs: ${sqm})`);
                console.log(`  Import: ${parseFloat(row.import_qty).toFixed(2)} + GR: ${parseFloat(row.gr_received).toFixed(2)} - Sold: ${parseFloat(row.confirmed_sold).toFixed(2)} + Adj: ${parseFloat(row.manual_adj).toFixed(2)} = Expected: ${expected.toFixed(2)}`);
                console.log(`  Current: ${current.toFixed(2)} | DIFF: ${diff.toFixed(2)} ${diff > 0 ? '↑ OVER' : '↓ UNDER'}`);

                // Check if the diff could be explained by the SQM/PCS conversion bug on older GRs
                if (sqm > 0 && Math.abs(diff) > 1) {
                    const grReceived = parseFloat(row.gr_received);
                    // What would the buggy code have added? SQM / sqmPerPiece (to get PCS) 
                    const buggyQty = grReceived / sqm;
                    const correctQty = grReceived; // SQM as-is
                    const bugDiff = buggyQty - correctQty;
                    if (Math.abs(bugDiff - diff) < 1) {
                        console.log(`  ⚠️ MATCHES CONVERSION BUG PATTERN: buggy would add ${buggyQty.toFixed(2)} instead of ${correctQty.toFixed(2)} (bug excess: ${bugDiff.toFixed(2)})`);
                    }
                }
                console.log('');
            } else {
                matches++;
            }
        }

        console.log(`\n===== SUMMARY =====`);
        console.log(`Products with GR checked: ${result.rows.length}`);
        console.log(`Matching (within 0.5): ${matches}`);
        console.log(`Still discrepant: ${discrepancies.length}`);

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        c.release();
        pool.end();
    }
})();

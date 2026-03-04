require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function auditAllProducts() {
    const client = await pool.connect();
    try {
        // Find ALL products that have GoodsReceiptItems (i.e., received goods)
        // and compare: expected qty (sum GR received - sum sales) vs actual inventory
        const query = `
            WITH gr_totals AS (
                SELECT 
                    gri.productid,
                    SUM(gri.quantityreceived) as total_received_sqm
                FROM GoodsReceiptItems gri
                GROUP BY gri.productid
            ),
            sales_totals AS (
                SELECT 
                    oi.productid,
                    COALESCE(SUM(oi.quantity), 0) as total_sold
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE o.status NOT IN ('CANCELLED')
                GROUP BY oi.productid
            ),
            adjustments AS (
                SELECT 
                    productid,
                    COALESCE(SUM(CASE WHEN transactiontype = 'ADJUSTMENT' THEN quantity ELSE 0 END), 0) as total_adjustment
                FROM InventoryTransactions
                WHERE referencetype NOT IN ('IMPORT_CSV')
                GROUP BY productid
            ),
            current_inv AS (
                SELECT 
                    productid,
                    SUM(quantityonhand) as current_qty
                FROM Inventory
                WHERE ownershiptype = 'OWNED'
                GROUP BY productid
            )
            SELECT 
                p.productid,
                p.productname,
                p.primaryunitid,
                u.unitcode as primary_unit_code,
                p.qteparcolis,
                p.qtecolisparpalette,
                p.size,
                COALESCE(gr.total_received_sqm, 0) as total_received,
                COALESCE(st.total_sold, 0) as total_sold,
                COALESCE(adj.total_adjustment, 0) as total_adjustments,
                COALESCE(ci.current_qty, 0) as current_qty,
                (COALESCE(gr.total_received_sqm, 0) - COALESCE(st.total_sold, 0) + COALESCE(adj.total_adjustment, 0)) as expected_qty
            FROM Products p
            JOIN gr_totals gr ON p.productid = gr.productid
            LEFT JOIN sales_totals st ON p.productid = st.productid
            LEFT JOIN adjustments adj ON p.productid = adj.productid
            LEFT JOIN current_inv ci ON p.productid = ci.productid
            LEFT JOIN Units u ON p.primaryunitid = u.unitid
            WHERE p.isactive = true
            ORDER BY ABS(COALESCE(ci.current_qty, 0) - (COALESCE(gr.total_received_sqm, 0) - COALESCE(st.total_sold, 0) + COALESCE(adj.total_adjustment, 0))) DESC
        `;

        const result = await client.query(query);

        let discrepancies = [];

        for (const row of result.rows) {
            const currentQty = parseFloat(row.current_qty);
            const expectedQty = parseFloat(row.expected_qty);
            const diff = Math.abs(currentQty - expectedQty);

            // Only report if discrepancy > 0.01
            if (diff > 0.01) {
                discrepancies.push({
                    productid: row.productid,
                    name: row.productname,
                    primaryUnit: row.primary_unit_code || 'NULL',
                    received: parseFloat(row.total_received),
                    sold: parseFloat(row.total_sold),
                    adjustments: parseFloat(row.total_adjustments),
                    currentQty: currentQty,
                    expectedQty: expectedQty,
                    difference: currentQty - expectedQty,
                    qteparcolis: parseFloat(row.qteparcolis),
                    qtecolisparpalette: parseFloat(row.qtecolisparpalette),
                    size: row.size
                });
            }
        }

        console.log(`\n===== INVENTORY DISCREPANCY AUDIT =====`);
        console.log(`Total products with GoodsReceipts: ${result.rows.length}`);
        console.log(`Products with discrepancies: ${discrepancies.length}\n`);

        for (const d of discrepancies) {
            const arrow = d.difference > 0 ? '↑ OVER' : '↓ UNDER';
            console.log(`[${d.productid}] ${d.name} (PrimaryUnit: ${d.primaryUnit})`);
            console.log(`  Received: ${d.received} | Sold: ${d.sold} | Adjustments: ${d.adjustments}`);
            console.log(`  Expected: ${d.expectedQty.toFixed(2)} | Current: ${d.currentQty.toFixed(2)} | Diff: ${d.difference.toFixed(2)} ${arrow}`);
            console.log('');
        }

        console.log(`\nTotal discrepancies found: ${discrepancies.length}`);

        // Output as JSON for the fix script
        const fs = require('fs');
        fs.writeFileSync('/tmp/inventory_discrepancies.json', JSON.stringify(discrepancies, null, 2));
        console.log('Saved to /tmp/inventory_discrepancies.json');

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

auditAllProducts();

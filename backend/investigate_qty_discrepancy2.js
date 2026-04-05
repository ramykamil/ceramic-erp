require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function investigate2() {
    const client = await pool.connect();
    try {
        console.log('=== FOCUSED INVESTIGATION: Why is inventory not matching GR - Sales? ===\n');

        // 1. Count products by their source of stock
        const catQuery = `
            WITH gr_products AS (
                SELECT DISTINCT productid FROM GoodsReceiptItems
            ),
            import_products AS (
                SELECT DISTINCT productid FROM InventoryTransactions WHERE referencetype = 'IMPORT_CSV'
            )
            SELECT 
                COUNT(*) FILTER (WHERE gp.productid IS NOT NULL AND ip.productid IS NOT NULL) as has_both,
                COUNT(*) FILTER (WHERE gp.productid IS NOT NULL AND ip.productid IS NULL) as gr_only,
                COUNT(*) FILTER (WHERE gp.productid IS NULL AND ip.productid IS NOT NULL) as import_only,
                COUNT(*) FILTER (WHERE gp.productid IS NULL AND ip.productid IS NULL) as neither
            FROM Products p
            LEFT JOIN gr_products gp ON p.productid = gp.productid
            LEFT JOIN import_products ip ON p.productid = ip.productid
            WHERE p.isactive = true
        `;
        const catResult = await client.query(catQuery);
        const cat = catResult.rows[0];
        console.log('Product categories:');
        console.log(`  Has GoodsReceipts AND CSV Import: ${cat.has_both}`);
        console.log(`  GoodsReceipts ONLY: ${cat.gr_only}`);
        console.log(`  CSV Import ONLY: ${cat.import_only}`);
        console.log(`  Neither: ${cat.neither}`);
        console.log('');

        // 2. What are the BULK ADJUSTMENT transactions? When were they applied?
        console.log('=== BULK ADJUSTMENT HISTORY ===');
        const bulkAdj = await client.query(`
            SELECT 
                notes, 
                COUNT(*) as count, 
                MIN(createdat) as first_at, 
                MAX(createdat) as last_at,
                SUM(quantity) as total_qty
            FROM InventoryTransactions 
            WHERE transactiontype = 'ADJUSTMENT'
            GROUP BY notes
            ORDER BY MAX(createdat) DESC
        `);
        for (const b of bulkAdj.rows) {
            console.log(`  "${b.notes}" | Count: ${b.count} | From: ${b.first_at} | To: ${b.last_at} | Total: ${parseFloat(b.total_qty).toFixed(2)}`);
        }
        console.log('');

        // 3. How many products have inventory ONLY from IMPORT_CSV and zero from GoodsReceipts?
        // These products' stock is correctly from the import but NOT trackable by GR-Sales formula
        const importOnlyStock = await client.query(`
            WITH gr_products AS (SELECT DISTINCT productid FROM GoodsReceiptItems),
            current_inv AS (
                SELECT productid, SUM(quantityonhand) as qty
                FROM Inventory WHERE ownershiptype = 'OWNED'
                GROUP BY productid
            )
            SELECT COUNT(*) as count, SUM(ci.qty) as total_qty
            FROM current_inv ci
            JOIN Products p ON ci.productid = p.productid
            LEFT JOIN gr_products gp ON p.productid = gp.productid
            WHERE gp.productid IS NULL AND p.isactive = true AND ci.qty > 0
        `);
        console.log(`Products with stock but NO GoodsReceipts: ${importOnlyStock.rows[0].count} (total qty: ${parseFloat(importOnlyStock.rows[0].total_qty || 0).toFixed(2)})`);
        console.log('');

        // 4. Check the ORDER STATUSES breakdown and how they affect inventory
        console.log('=== ORDER STATUS BREAKDOWN ===');
        const orderStatuses = await client.query(`
            SELECT 
                status, 
                COUNT(*) as order_count, 
                SUM(totalamount) as total_amount,
                MIN(createdat) as first_order,
                MAX(createdat) as last_order
            FROM Orders 
            GROUP BY status 
            ORDER BY COUNT(*) DESC
        `);
        for (const s of orderStatuses.rows) {
            console.log(`  ${s.status}: ${s.order_count} orders | Total: ${parseFloat(s.total_amount || 0).toFixed(2)} DA | First: ${s.first_order} | Last: ${s.last_order}`);
        }
        console.log('');

        // 5. KEY: Check which orders have status NOT IN (CANCELLED, PENDING) meaning the audit includes them
        //    but finalizeOrder only deducts from CONFIRMED+ orders
        console.log('=== SALES DEDUCTION CHECK ===');
        console.log('Orders status NOT IN (CANCELLED) includes PENDING orders in audit, but PENDING orders do NOT deduct inventory!');

        const pendingImpact = await client.query(`
            SELECT 
                oi.productid,
                p.productname,
                SUM(oi.quantity) as total_pending_qty
            FROM OrderItems oi
            JOIN Orders o ON oi.orderid = o.orderid
            JOIN Products p ON oi.productid = p.productid
            WHERE o.status = 'PENDING'
            GROUP BY oi.productid, p.productname
            HAVING SUM(oi.quantity) > 0
            ORDER BY SUM(oi.quantity) DESC
            LIMIT 20
        `);
        console.log(`\nTop 20 products with PENDING order quantities (NOT deducted yet):`);
        for (const p of pendingImpact.rows) {
            console.log(`  [${p.productid}] ${p.productname}: ${parseFloat(p.total_pending_qty).toFixed(2)}`);
        }
        console.log('');

        // 6. CRITICAL CHECK: comparing what the audit formula considers as "sales" vs what was actually deducted
        //    The audit considers all non-cancelled orders as sales. But finalizeOrder only processes CONFIRMED orders.
        //    If a PENDING order is deleted (not cancelled), the audit wouldn't count it but any pre-reserved qty wouldn't match.

        // For discrepant products, check if (GR - ConfirmedSales) = CurrentInventory (ignoring PENDING)
        console.log('=== CHECKING: GR - CONFIRMED/DELIVERED Sales ONLY ===');
        const confirmedOnly = await client.query(`
            WITH gr_totals AS (
                SELECT productid, SUM(quantityreceived) as total_received
                FROM GoodsReceiptItems GROUP BY productid
            ),
            confirmed_sales AS (
                SELECT oi.productid, SUM(oi.quantity) as total_sold
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE o.status IN ('CONFIRMED', 'DELIVERED')
                GROUP BY oi.productid
            ),
            current_inv AS (
                SELECT productid, SUM(quantityonhand) as current_qty
                FROM Inventory WHERE ownershiptype = 'OWNED'
                GROUP BY productid
            )
            SELECT
                p.productid, p.productname,
                COALESCE(gr.total_received, 0) as gr_received,
                COALESCE(cs.total_sold, 0) as confirmed_sold,
                COALESCE(ci.current_qty, 0) as current_qty,
                (COALESCE(gr.total_received, 0) - COALESCE(cs.total_sold, 0)) as expected_from_gr,
                COALESCE(ci.current_qty, 0) - (COALESCE(gr.total_received, 0) - COALESCE(cs.total_sold, 0)) as diff
            FROM Products p
            LEFT JOIN gr_totals gr ON p.productid = gr.productid
            LEFT JOIN confirmed_sales cs ON p.productid = cs.productid
            LEFT JOIN current_inv ci ON p.productid = ci.productid
            WHERE p.isactive = true
            AND COALESCE(gr.total_received, 0) > 0
            AND ABS(COALESCE(ci.current_qty, 0) - (COALESCE(gr.total_received, 0) - COALESCE(cs.total_sold, 0))) > 0.5
            ORDER BY ABS(COALESCE(ci.current_qty, 0) - (COALESCE(gr.total_received, 0) - COALESCE(cs.total_sold, 0))) DESC
            LIMIT 20
        `);
        console.log(`\nProducts WITH GoodsReceipts that still don't match (GR - Confirmed Sales):`);
        for (const r of confirmedOnly.rows) {
            console.log(`  [${r.productid}] ${r.productname}`);
            console.log(`    GR: ${parseFloat(r.gr_received).toFixed(2)} - Sold: ${parseFloat(r.confirmed_sold).toFixed(2)} = Expected: ${parseFloat(r.expected_from_gr).toFixed(2)} | Current: ${parseFloat(r.current_qty).toFixed(2)} | Diff: ${parseFloat(r.diff).toFixed(2)}`);
        }

        // 7. Summary
        console.log('\n\n=== ROOT CAUSE ANALYSIS ===');

        // Count products where: current_qty matches import amount (within tolerance)
        const importMatch = await client.query(`
            WITH import_totals AS (
                SELECT productid, SUM(quantity) as import_qty
                FROM InventoryTransactions
                WHERE referencetype = 'IMPORT_CSV'
                GROUP BY productid
            ),
            current_inv AS (
                SELECT productid, SUM(quantityonhand) as current_qty
                FROM Inventory WHERE ownershiptype = 'OWNED'
                GROUP BY productid
            ),
            gr_products AS (SELECT DISTINCT productid FROM GoodsReceiptItems)
            SELECT 
                COUNT(*) FILTER (WHERE gp.productid IS NULL AND ci.current_qty > 0) as import_only_still_has_stock,
                COUNT(*) FILTER (WHERE gp.productid IS NOT NULL AND ABS(ci.current_qty - (SELECT COALESCE(SUM(gri.quantityreceived), 0) FROM GoodsReceiptItems gri WHERE gri.productid = p.productid)) > 0.5) as gr_mismatch
            FROM Products p
            LEFT JOIN import_totals it ON p.productid = it.productid
            LEFT JOIN current_inv ci ON p.productid = ci.productid
            LEFT JOIN gr_products gp ON p.productid = gp.productid
            WHERE p.isactive = true
        `);
        console.log(`Products with stock from import ONLY (no GR): ${importMatch.rows[0].import_only_still_has_stock}`);
        console.log('');
        console.log('EXPLANATION:');
        console.log('The inventory was originally imported from "Table Produit NOUVEAUX.xls" via CSV import.');
        console.log('Products that were purchased through the system have GoodsReceipts.');
        console.log('Products that were ONLY imported via CSV have NO GoodsReceipts.');
        console.log('');
        console.log('The formula GR_received - Sales + Adj is ONLY correct for products where ALL stock');
        console.log('came through GoodsReceipts (purchase orders received).');
        console.log('');
        console.log('For import-only products, the correct inventory IS the imported amount minus sales.');
        console.log('The "expected" qty from GR-Sales gives WRONG results for these products.');

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        client.release();
        pool.end();
    }
}

investigate2();

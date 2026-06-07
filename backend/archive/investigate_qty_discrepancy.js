require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function investigate() {
    const client = await pool.connect();
    try {
        console.log('=== INVENTORY DISCREPANCY INVESTIGATION ===');
        console.log('Date:', new Date().toISOString());
        console.log('');

        // 1. Core comparison: inventory vs (GR received - Sales confirmed + Manual Adjustments)
        const mainQuery = `
            WITH gr_totals AS (
                SELECT 
                    gri.productid,
                    SUM(gri.quantityreceived) as total_received
                FROM GoodsReceiptItems gri
                GROUP BY gri.productid
            ),
            sales_totals AS (
                SELECT 
                    oi.productid,
                    COALESCE(SUM(oi.quantity), 0) as total_sold_raw,
                    COUNT(DISTINCT o.orderid) as order_count,
                    STRING_AGG(DISTINCT o.status, ', ') as order_statuses
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE o.status NOT IN ('CANCELLED')
                GROUP BY oi.productid
            ),
            -- Sales in SQM (with unit conversion applied like finalizeOrder does)
            sales_sqm AS (
                SELECT 
                    oi.productid,
                    SUM(
                        CASE 
                            WHEN u.unitcode = 'PCS' 
                                 AND p.productname NOT ILIKE 'fiche%'
                                 AND p.size ~ '\\d{2,3}\\s*[xX*/]\\s*\\d{2,3}'
                            THEN 
                                oi.quantity * (
                                    (CAST(SUBSTRING(p.size FROM '(\\d{2,3})\\s*[xX*/]') AS NUMERIC) *
                                     CAST(SUBSTRING(p.size FROM '[xX*/]\\s*(\\d{2,3})') AS NUMERIC)) / 10000.0
                                )
                            ELSE oi.quantity
                        END
                    ) as total_sold_converted
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                JOIN Products p ON oi.productid = p.productid
                LEFT JOIN Units u ON oi.unitid = u.unitid
                WHERE o.status NOT IN ('CANCELLED')
                GROUP BY oi.productid
            ),
            -- Also look at PENDING orders (reserved but not sold)
            pending_sales AS (
                SELECT 
                    oi.productid,
                    COALESCE(SUM(oi.quantity), 0) as total_pending_raw
                FROM OrderItems oi
                JOIN Orders o ON oi.orderid = o.orderid
                WHERE o.status = 'PENDING'
                GROUP BY oi.productid
            ),
            adjustments AS (
                SELECT 
                    productid,
                    COALESCE(SUM(CASE WHEN transactiontype = 'ADJUSTMENT' AND referencetype NOT IN ('IMPORT_CSV') THEN quantity ELSE 0 END), 0) as manual_adj,
                    COALESCE(SUM(CASE WHEN transactiontype = 'ADJUSTMENT' AND referencetype = 'IMPORT_CSV' THEN quantity ELSE 0 END), 0) as import_adj,
                    COALESCE(SUM(CASE WHEN transactiontype = 'OUT' THEN quantity ELSE 0 END), 0) as total_out_txn,
                    COALESCE(SUM(CASE WHEN transactiontype = 'IN' THEN quantity ELSE 0 END), 0) as total_in_txn,
                    COUNT(*) as txn_count
                FROM InventoryTransactions
                GROUP BY productid
            ),
            current_inv AS (
                SELECT 
                    productid,
                    SUM(quantityonhand) as current_qty,
                    SUM(quantityreserved) as current_reserved
                FROM Inventory
                WHERE ownershiptype = 'OWNED'
                GROUP BY productid
            )
            SELECT 
                p.productid,
                p.productname,
                p.productcode,
                p.size,
                pu.unitcode as primary_unit,
                COALESCE(gr.total_received, 0) as gr_received,
                COALESCE(st.total_sold_raw, 0) as sales_raw,
                COALESCE(ss.total_sold_converted, 0) as sales_converted,
                COALESCE(st.order_count, 0) as order_count,
                COALESCE(st.order_statuses, 'none') as order_statuses,
                COALESCE(ps.total_pending_raw, 0) as pending_raw,
                COALESCE(adj.manual_adj, 0) as manual_adj,
                COALESCE(adj.import_adj, 0) as import_adj,
                COALESCE(adj.total_out_txn, 0) as out_txns,
                COALESCE(adj.total_in_txn, 0) as in_txns,
                COALESCE(adj.txn_count, 0) as txn_count,
                COALESCE(ci.current_qty, 0) as current_qty,
                COALESCE(ci.current_reserved, 0) as current_reserved,
                (COALESCE(gr.total_received, 0) - COALESCE(ss.total_sold_converted, 0) + COALESCE(adj.manual_adj, 0)) as expected_qty_v1,
                (COALESCE(gr.total_received, 0) - COALESCE(ss.total_sold_converted, 0)) as expected_no_adj
            FROM Products p
            LEFT JOIN Units pu ON p.primaryunitid = pu.unitid
            LEFT JOIN gr_totals gr ON p.productid = gr.productid
            LEFT JOIN sales_totals st ON p.productid = st.productid
            LEFT JOIN sales_sqm ss ON p.productid = ss.productid
            LEFT JOIN pending_sales ps ON p.productid = ps.productid
            LEFT JOIN adjustments adj ON p.productid = adj.productid
            LEFT JOIN current_inv ci ON p.productid = ci.productid
            WHERE p.isactive = true
            ORDER BY ABS(COALESCE(ci.current_qty, 0) - (COALESCE(gr.total_received, 0) - COALESCE(ss.total_sold_converted, 0) + COALESCE(adj.manual_adj, 0))) DESC
        `;

        const result = await client.query(mainQuery);

        let discrepancies = [];
        let matchCount = 0;

        for (const row of result.rows) {
            const current = parseFloat(row.current_qty);
            const expectedV1 = parseFloat(row.expected_qty_v1);
            const expectedNoAdj = parseFloat(row.expected_no_adj);
            const diff = current - expectedV1;

            if (Math.abs(diff) > 0.5) {
                discrepancies.push({
                    id: row.productid,
                    name: row.productname,
                    code: row.productcode,
                    size: row.size,
                    unit: row.primary_unit,
                    gr: parseFloat(row.gr_received),
                    salesRaw: parseFloat(row.sales_raw),
                    salesConverted: parseFloat(row.sales_converted),
                    orderCount: parseInt(row.order_count),
                    statuses: row.order_statuses,
                    pendingRaw: parseFloat(row.pending_raw),
                    manualAdj: parseFloat(row.manual_adj),
                    importAdj: parseFloat(row.import_adj),
                    outTxns: parseFloat(row.out_txns),
                    inTxns: parseFloat(row.in_txns),
                    txnCount: parseInt(row.txn_count),
                    current: current,
                    reserved: parseFloat(row.current_reserved),
                    expectedV1: expectedV1,
                    expectedNoAdj: expectedNoAdj,
                    diffFromExpected: diff
                });
            } else {
                matchCount++;
            }
        }

        console.log(`Total active products scanned: ${result.rows.length}`);
        console.log(`Products matching (within 0.5): ${matchCount}`);
        console.log(`Products with discrepancies: ${discrepancies.length}`);
        console.log('');

        // Show summary categories
        const overStock = discrepancies.filter(d => d.diffFromExpected > 0);
        const underStock = discrepancies.filter(d => d.diffFromExpected < 0);
        console.log(`  Over-stocked (current > expected): ${overStock.length}`);
        console.log(`  Under-stocked (current < expected): ${underStock.length}`);
        console.log('');

        // Show details for each discrepancy
        console.log('=== DETAILED DISCREPANCY LIST ===');
        console.log('');
        for (const d of discrepancies.slice(0, 50)) {
            const arrow = d.diffFromExpected > 0 ? '↑ OVER' : '↓ UNDER';
            console.log(`[${d.id}] ${d.name}`);
            console.log(`  Size: ${d.size || 'N/A'} | PrimaryUnit: ${d.unit || 'N/A'}`);
            console.log(`  GR Received: ${d.gr.toFixed(2)} | Sales Raw: ${d.salesRaw.toFixed(2)} | Sales Converted: ${d.salesConverted.toFixed(2)}`);
            console.log(`  Orders: ${d.orderCount} (${d.statuses}) | Pending: ${d.pendingRaw.toFixed(2)}`);
            console.log(`  Manual Adj: ${d.manualAdj.toFixed(2)} | Import Adj: ${d.importAdj.toFixed(2)}`);
            console.log(`  OUT txns: ${d.outTxns.toFixed(2)} | IN txns: ${d.inTxns.toFixed(2)} | Total txns: ${d.txnCount}`);
            console.log(`  Current Qty: ${d.current.toFixed(2)} | Reserved: ${d.reserved.toFixed(2)}`);
            console.log(`  Expected (GR-Sales+Adj): ${d.expectedV1.toFixed(2)} | Expected (GR-Sales): ${d.expectedNoAdj.toFixed(2)}`);
            console.log(`  DIFF: ${d.diffFromExpected.toFixed(2)} ${arrow}`);
            console.log('');
        }

        if (discrepancies.length > 50) {
            console.log(`... and ${discrepancies.length - 50} more discrepancies`);
        }

        // 2. Check if there are orders that modified inventory after the last fix
        console.log('');
        console.log('=== RECENT CONFIRMED ORDERS (last 7 days) ===');
        const recentOrders = await client.query(`
            SELECT o.orderid, o.ordernumber, o.status, o.createdat, o.updatedat, o.totalamount,
                   COUNT(oi.orderitemid) as item_count,
                   SUM(oi.quantity) as total_qty
            FROM Orders o
            LEFT JOIN OrderItems oi ON o.orderid = oi.orderid
            WHERE o.status NOT IN ('CANCELLED')
            AND o.createdat > NOW() - INTERVAL '7 days'
            GROUP BY o.orderid
            ORDER BY o.createdat DESC
        `);

        for (const o of recentOrders.rows) {
            console.log(`  Order ${o.ordernumber} | Status: ${o.status} | Created: ${o.createdat} | Items: ${o.item_count} | TotalQty: ${parseFloat(o.total_qty || 0).toFixed(2)}`);
        }

        // 3. Check recent purchase orders
        console.log('');
        console.log('=== RECENT PURCHASE ORDERS (last 7 days) ===');
        const recentPOs = await client.query(`
            SELECT po.purchaseorderid, po.ponumber, po.status, po.createdat,
                   COUNT(poi.purchaseorderitemid) as item_count
            FROM PurchaseOrders po
            LEFT JOIN PurchaseOrderItems poi ON po.purchaseorderid = poi.purchaseorderid
            WHERE po.createdat > NOW() - INTERVAL '7 days'
            GROUP BY po.purchaseorderid
            ORDER BY po.createdat DESC
        `);

        for (const po of recentPOs.rows) {
            console.log(`  PO ${po.ponumber} | Status: ${po.status} | Created: ${po.createdat} | Items: ${po.item_count}`);
        }

        // 4. Check recent GoodsReceipts
        console.log('');
        console.log('=== RECENT GOODS RECEIPTS (last 7 days) ===');
        const recentGRs = await client.query(`
            SELECT gr.goodsreceiptid, gr.grnumber, gr.createdat,
                   COUNT(gri.goodsreceiptitemid) as item_count,
                   SUM(gri.quantityreceived) as total_received
            FROM GoodsReceipts gr
            LEFT JOIN GoodsReceiptItems gri ON gr.goodsreceiptid = gri.goodsreceiptid
            WHERE gr.createdat > NOW() - INTERVAL '7 days'
            GROUP BY gr.goodsreceiptid
            ORDER BY gr.createdat DESC
        `);

        for (const gr of recentGRs.rows) {
            console.log(`  GR ${gr.grnumber} | Created: ${gr.createdat} | Items: ${gr.item_count} | Total Received: ${parseFloat(gr.total_received || 0).toFixed(2)}`);
        }

        // 5. Check recent inventory adjustments
        console.log('');
        console.log('=== RECENT INVENTORY TRANSACTIONS (last 7 days) ===');
        const recentTxns = await client.query(`
            SELECT it.transactionid, it.productid, p.productname, it.transactiontype, 
                   it.quantity, it.referencetype, it.notes, it.createdat
            FROM InventoryTransactions it
            JOIN Products p ON it.productid = p.productid
            WHERE it.createdat > NOW() - INTERVAL '7 days'
            ORDER BY it.createdat DESC
            LIMIT 30
        `);

        for (const t of recentTxns.rows) {
            console.log(`  [${t.transactionid}] ${t.productname} | ${t.transactiontype} | Qty: ${parseFloat(t.quantity).toFixed(2)} | Ref: ${t.referencetype} | ${t.createdat}`);
            if (t.notes) console.log(`    Notes: ${t.notes}`);
        }

        // 6. For the specific discrepant products, deep-dive into their transaction history
        if (discrepancies.length > 0) {
            console.log('');
            console.log('=== DEEP DIVE: TOP 10 DISCREPANT PRODUCTS ===');
            for (const d of discrepancies.slice(0, 10)) {
                console.log(`\n--- [${d.id}] ${d.name} ---`);

                // Get all inventory transactions
                const txns = await client.query(`
                    SELECT transactiontype, quantity, referencetype, referenceid, notes, createdat
                    FROM InventoryTransactions
                    WHERE productid = $1
                    ORDER BY createdat ASC
                `, [d.id]);

                let runningTotal = 0;
                for (const t of txns.rows) {
                    const qty = parseFloat(t.quantity);
                    if (t.transactiontype === 'IN' || t.transactiontype === 'ADJUSTMENT') {
                        runningTotal += qty;
                    } else if (t.transactiontype === 'OUT') {
                        runningTotal -= qty;
                    }
                    console.log(`  ${t.createdat} | ${t.transactiontype} | ${qty > 0 ? '+' : ''}${qty.toFixed(2)} | Running: ${runningTotal.toFixed(2)} | ${t.referencetype} | ${t.notes || ''}`);
                }
                console.log(`  Final running total from transactions: ${runningTotal.toFixed(2)}`);
                console.log(`  Current inventory quantity: ${d.current.toFixed(2)}`);
                console.log(`  Expected (GR-Sales+Adj): ${d.expectedV1.toFixed(2)}`);
            }
        }

    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        client.release();
        pool.end();
    }
}

investigate();

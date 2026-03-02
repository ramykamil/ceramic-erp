const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function checkOrderHistory() {
    try {
        // Read the deep duplicates CSV to get all product IDs
        const csvPath = path.resolve(__dirname, '..', '..', 'deep_duplicates_scan.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.trim().split('\n').slice(1); // skip header

        const productIds = new Set();
        const productInfo = new Map(); // id -> { name, group, family }

        for (const line of lines) {
            if (!line.trim()) continue;
            const parts = line.match(/"([^"]*)"/g);
            if (!parts || parts.length < 6) continue;
            const groupNum = parts[0].replace(/"/g, '');
            const family = parts[1].replace(/"/g, '');
            const pid = parseInt(parts[2].replace(/"/g, ''));
            const name = parts[4].replace(/"/g, '');
            productIds.add(pid);
            productInfo.set(pid, { name, group: groupNum, family });
        }

        const idArray = Array.from(productIds);
        console.log(`Checking order history for ${idArray.length} products across ${new Set([...productInfo.values()].map(v => v.group)).size} groups...\n`);

        // Check sales orders (OrderItems + Orders)
        const salesResult = await cloudPool.query(`
            SELECT oi.ProductID, 
                   COUNT(DISTINCT o.OrderID) as order_count,
                   MAX(o.OrderDate) as last_order_date,
                   SUM(oi.Quantity) as total_qty_sold,
                   STRING_AGG(DISTINCT o.OrderType, ', ') as order_types
            FROM OrderItems oi
            JOIN Orders o ON oi.OrderID = o.OrderID
            WHERE oi.ProductID = ANY($1)
              AND o.Status NOT IN ('CANCELLED')
            GROUP BY oi.ProductID
        `, [idArray]);

        const salesMap = new Map();
        for (const r of salesResult.rows) {
            salesMap.set(r.productid, {
                orderCount: parseInt(r.order_count),
                lastOrderDate: r.last_order_date,
                totalQtySold: parseFloat(r.total_qty_sold || 0),
                orderTypes: r.order_types
            });
        }

        // Check purchase orders (PurchaseOrderItems + PurchaseOrders)
        const purchaseResult = await cloudPool.query(`
            SELECT poi.ProductID,
                   COUNT(DISTINCT po.PurchaseOrderID) as po_count,
                   MAX(po.OrderDate) as last_po_date,
                   SUM(poi.Quantity) as total_qty_purchased
            FROM PurchaseOrderItems poi
            JOIN PurchaseOrders po ON poi.PurchaseOrderID = po.PurchaseOrderID
            WHERE poi.ProductID = ANY($1)
              AND po.Status NOT IN ('CANCELLED')
            GROUP BY poi.ProductID
        `, [idArray]);

        const purchaseMap = new Map();
        for (const r of purchaseResult.rows) {
            purchaseMap.set(r.productid, {
                poCount: parseInt(r.po_count),
                lastPoDate: r.last_po_date,
                totalQtyPurchased: parseFloat(r.total_qty_purchased || 0)
            });
        }

        // Check inventory quantities
        const invResult = await cloudPool.query(`
            SELECT ProductID, SUM(QuantityOnHand) as qty
            FROM Inventory
            WHERE ProductID = ANY($1)
            GROUP BY ProductID
        `, [idArray]);

        const invMap = new Map();
        for (const r of invResult.rows) {
            invMap.set(r.productid, parseFloat(r.qty || 0));
        }

        // Build the CSV with order history
        let csv = 'Group #,Category/Family,Product ID,Product Name,Current Qty,Sales Orders,Last Sale Date,Total Qty Sold,Order Types,Purchase Orders,Last PO Date,Total Qty Purchased,Has Activity\n';

        // Group products by group number
        const groups = new Map();
        for (const [pid, info] of productInfo.entries()) {
            if (!groups.has(info.group)) groups.set(info.group, []);
            groups.get(info.group).push(pid);
        }

        let groupsWithActivity = 0;

        for (const [groupNum, pids] of [...groups.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
            let groupHasActivity = false;
            for (const pid of pids) {
                const info = productInfo.get(pid);
                const sales = salesMap.get(pid) || { orderCount: 0, lastOrderDate: '', totalQtySold: 0, orderTypes: '' };
                const purchase = purchaseMap.get(pid) || { poCount: 0, lastPoDate: '', totalQtyPurchased: 0 };
                const qty = invMap.get(pid) || 0;
                const hasActivity = sales.orderCount > 0 || purchase.poCount > 0 || qty > 0;
                if (hasActivity) groupHasActivity = true;

                csv += `"${groupNum}","${info.family}","${pid}","${info.name.replace(/"/g, '""')}","${qty}","${sales.orderCount}","${sales.lastOrderDate || ''}","${sales.totalQtySold}","${sales.orderTypes}","${purchase.poCount}","${purchase.lastPoDate || ''}","${purchase.totalQtyPurchased}","${hasActivity ? 'YES' : 'NO'}"\n`;
            }
            if (groupHasActivity) groupsWithActivity++;
        }

        const outputPath = path.resolve(__dirname, '..', '..', 'duplicates_order_history.csv');
        fs.writeFileSync(outputPath, csv);

        console.log(`✅ Report saved to: ${outputPath}`);
        console.log(`\nSummary:`);
        console.log(`  Total duplicate groups: ${groups.size}`);
        console.log(`  Groups with any activity (orders/purchases/stock): ${groupsWithActivity}`);
        console.log(`  Products with sales orders: ${salesMap.size}`);
        console.log(`  Products with purchase orders: ${purchaseMap.size}`);
        console.log(`  Products with inventory: ${invMap.size}`);

    } catch (err) {
        console.error('❌ Error:', err.message, err.stack);
    } finally {
        cloudPool.end();
    }
}

checkOrderHistory();

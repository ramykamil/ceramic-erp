const pool = require('../backend/src/config/database');

async function check() {
    try {
        console.log("--- Last 10 Adjustments ---");
        const adj = await pool.query(`
            SELECT it.ProductID, p.ProductName, it.Quantity, it.Notes, it.CreatedAt
            FROM InventoryTransactions it 
            JOIN Products p ON it.ProductID = p.ProductID 
            WHERE it.TransactionType = 'ADJUSTMENT' 
              AND it.Notes NOT LIKE 'Sync %' 
              AND it.Notes NOT LIKE 'Correction %' 
            ORDER BY it.CreatedAt DESC 
            LIMIT 10
        `);
        console.log(JSON.stringify(adj.rows, null, 2));

        console.log("--- Purchase Summary since April 6 ---");
        const pur = await pool.query(`
            SELECT SUM(gri.QuantityReceived) as total
            FROM GoodsReceiptItems gri
            JOIN GoodsReceipts gr ON gri.ReceiptID = gr.ReceiptID
            WHERE gr.ReceiptDate >= '2026-04-06' AND gr.Status = 'RECEIVED'
        `);
        console.log("Total Purchased:", pur.rows[0].total);

        console.log("--- Sales Summary since April 6 ---");
        const sal = await pool.query(`
            SELECT SUM(oi.Quantity) as total
            FROM OrderItems oi
            JOIN Orders o ON oi.OrderID = o.OrderID
            WHERE o.OrderDate >= '2026-04-06' AND o.Status NOT IN ('CANCELLED', 'DRAFT')
        `);
        console.log("Total Sold:", sal.rows[0].total);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

check();

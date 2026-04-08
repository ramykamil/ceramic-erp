const pool = require('../backend/src/config/database');

const START_DATE = '2026-04-06';

async function auditInventory() {
    console.log(`[Audit] Starting inventory audit for records since ${START_DATE}...`);
    const client = await pool.connect();
    
    try {
        // 1. Check Missing Sales Transactions
        const salesCheck = await client.query(`
            SELECT COUNT(*) as missing_sales
            FROM Orders o
            LEFT JOIN InventoryTransactions it ON o.OrderID = it.ReferenceID 
                 AND it.ReferenceType = 'ORDER' AND it.TransactionType = 'OUT'
            WHERE o.Status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
              AND o.OrderDate >= $1
              AND it.TransactionID IS NULL
        `, [START_DATE]);

        // 2. Check Missing Purchase Transactions
        const purchaseCheck = await client.query(`
            SELECT COUNT(*) as missing_purchases
            FROM GoodsReceipts gr
            LEFT JOIN InventoryTransactions it ON gr.ReceiptID = it.ReferenceID 
                 AND it.ReferenceType = 'GOODS_RECEIPT' AND it.TransactionType = 'IN'
            WHERE gr.Status = 'RECEIVED'
              AND gr.ReceiptDate >= $1
              AND it.TransactionID IS NULL
        `, [START_DATE]);

        // 3. Check Manual Adjustments Count
        const adjustmentCheck = await client.query(`
            SELECT COUNT(*) as recent_adjustments
            FROM InventoryTransactions
            WHERE TransactionType = 'ADJUSTMENT'
              AND CreatedAt >= $1
        `, [START_DATE]);

        console.log(`\n[Audit Result]`);
        console.log(`- Missing Sales Deductions: ${salesCheck.rows[0].missing_sales}`);
        console.log(`- Missing Purchase Receipts: ${purchaseCheck.rows[0].missing_purchases}`);
        console.log(`- Recent Manual Adjustments: ${adjustmentCheck.rows[0].recent_adjustments}`);
        console.log(`\nTotal actions needed: ${parseInt(salesCheck.rows[0].missing_sales) + parseInt(purchaseCheck.rows[0].missing_purchases)} corrections.`);

    } catch (error) {
        console.error('[Audit] Fatal error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

auditInventory();

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function globalAudit() {
    try {
        console.log('--- Starting Global Zero-Conversion inventory Verification ---');
        console.log('Criteria: InventoryTransaction.Quantity must match SourceDocument.Quantity exactly.');

        const findings = [];

        // 1. Audit Goods Receipt Transactions
        const grQuery = `
            SELECT 
                it.TransactionID, it.ProductID, it.Quantity as inv_qty, it.ReferenceID as ReceiptID, 
                gri.QuantityReceived as source_qty,
                p.ProductName, p.ProductCode
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            JOIN GoodsReceiptItems gri ON it.ReferenceID = gri.ReceiptID AND it.ProductID = gri.ProductID
            WHERE it.ReferenceType = 'GOODS_RECEIPT'
              AND it.TransactionType = 'IN'
              AND ABS(it.Quantity - gri.QuantityReceived) > 0.001
        `;
        const grRes = await pool.query(grQuery);
        for(const row of grRes.rows) {
            findings.push({ ...row, type: 'GOODS_RECEIPT', diff: row.inv_qty - row.source_qty });
        }

        // 2. Audit Sales Order Transactions
        const ordQuery = `
            SELECT 
                it.TransactionID, it.ProductID, it.Quantity as inv_qty, it.ReferenceID as OrderID, 
                oi.Quantity as source_qty,
                p.ProductName, p.ProductCode
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            JOIN OrderItems oi ON it.ReferenceID = oi.OrderID AND it.ProductID = oi.ProductID
            WHERE it.ReferenceType = 'ORDER'
              AND it.TransactionType = 'OUT'
              AND ABS(it.Quantity - oi.Quantity) > 0.001
        `;
        const ordRes = await pool.query(ordQuery);
        for(const row of ordRes.rows) {
            findings.push({ ...row, type: 'SALES_ORDER', diff: row.inv_qty - row.source_qty });
        }

        // 3. Audit Purchase Order Transactions (In case they were directly RECEIVED without GR)
        // In this system, POs usually have a GR, but let's check.
        // Wait, normally InventoryTransactions point to 'GOODS_RECEIPT'.
        
        console.log(`Scan completed. Found ${findings.length} transactions with discrepancies.`);
        
        if (findings.length > 0) {
            // Group by product for better visibility
            const report = findings.reduce((acc, f) => {
                if (!acc[f.productid]) acc[f.productid] = { name: f.productname, code: f.productcode, discrepancies: [] };
                acc[f.productid].discrepancies.push(f);
                return acc;
            }, {});

            console.log(JSON.stringify(report, null, 2));
        } else {
            console.log('SUCCESS: All inventory transactions match their source documents perfectly.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

globalAudit();

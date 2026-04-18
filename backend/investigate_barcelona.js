const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function investigate() {
    try {
        // 1. Find product
        const pRes = await pool.query(`
            SELECT ProductID, ProductName, Size, QteParColis, QteColisParPalette 
            FROM Products 
            WHERE ProductName ILIKE '%BARCELONA CREMA%' AND ProductName ILIKE '%60/60%'
        `);

        if (pRes.rows.length === 0) {
            console.log('Product not found.');
            return;
        }

        const product = pRes.rows[0];
        console.log('Product Found:', product);
        const pid = product.productid;

        // 2. Audit Transactions vs Sources
        console.log('--- Transaction Audit ---');
        
        // Check GRs
        const grAudit = await pool.query(`
            SELECT it.TransactionID, it.Quantity as it_qty, gri.QuantityReceived as source_qty, it.ReferenceID, it.CreatedAt
            FROM InventoryTransactions it
            JOIN GoodsReceiptItems gri ON it.ReferenceID = gri.ReceiptID AND it.ProductID = gri.ProductID
            WHERE it.ProductID = $1 AND it.ReferenceType = 'GOODS_RECEIPT'
        `, [pid]);
        console.log(`Goods Receipts: ${grAudit.rows.length}`);
        grAudit.rows.forEach(r => {
            if (Math.abs(r.it_qty - r.source_qty) > 0.01) {
                console.log(`Mismatch in GR ${r.referenceid}: Inv=${r.it_qty}, Source=${r.source_qty}`);
            }
        });

        // Check Orders
        const ordAudit = await pool.query(`
            SELECT it.TransactionID, it.Quantity as it_qty, oi.Quantity as source_qty, it.ReferenceID, it.CreatedAt
            FROM InventoryTransactions it
            JOIN OrderItems oi ON it.ReferenceID = oi.OrderID AND it.ProductID = oi.ProductID
            WHERE it.ProductID = $1 AND it.ReferenceType = 'ORDER'
        `, [pid]);
        console.log(`Sales Orders: ${ordAudit.rows.length}`);
        ordAudit.rows.forEach(r => {
            if (Math.abs(r.it_qty - r.source_qty) > 0.01) {
                console.log(`Mismatch in Order ${r.referenceid}: Inv=${r.it_qty}, Source=${r.source_qty}`);
            }
        });

        // 3. Find other transaction types (Adjustments, Transfers, etc.)
        const checkOther = await pool.query(`
            SELECT TransactionID, Quantity, TransactionType, ReferenceType, ReferenceID, CreatedAt, Notes
            FROM InventoryTransactions
            WHERE ProductID = $1 AND ReferenceType NOT IN ('GOODS_RECEIPT', 'ORDER')
        `, [pid]);
        console.log('\n--- Other Transactions (Adjustments, etc.) ---');
        console.table(checkOther.rows);

        // 4. Current inventory table
        const invRes = await pool.query(`SELECT QuantityOnHand, PalletCount, ColisCount FROM Inventory WHERE ProductID = $1`, [pid]);
        console.log('\n--- Current Inventory Record ---');
        console.table(invRes.rows);

        // 5. Total Purchases across all time
        const poRes = await pool.query(`
            SELECT SUM(Quantity) as total_ordered FROM PurchaseOrderItems WHERE ProductID = $1
        `, [pid]);
        console.log('Total Quantity Ordered in POs:', poRes.rows[0].total_ordered);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

investigate();

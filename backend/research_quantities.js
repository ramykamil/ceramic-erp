const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkQuantities() {
    try {
        const productId = 4945;
        
        console.log('--- Purchase Order Items for Product 4945 ---');
        const poRes = await pool.query(`
            SELECT poi.PurchaseOrderID, poi.Quantity, u.UnitCode, po.PONumber
            FROM PurchaseOrderItems poi
            JOIN Units u ON poi.UnitID = u.UnitID
            JOIN PurchaseOrders po ON poi.PurchaseOrderID = po.PurchaseOrderID
            WHERE poi.ProductID = $1
            ORDER BY po.OrderDate DESC LIMIT 5
        `, [productId]);
        console.table(poRes.rows);

        console.log('\n--- Order Items for Product 4945 ---');
        const ordRes = await pool.query(`
            SELECT oi.OrderID, oi.Quantity, u.UnitCode, o.OrderNumber
            FROM OrderItems oi
            JOIN Units u ON oi.UnitID = u.UnitID
            JOIN Orders o ON oi.OrderID = o.OrderID
            WHERE oi.ProductID = $1
            ORDER BY o.OrderDate DESC LIMIT 5
        `, [productId]);
        console.table(ordRes.rows);

        console.log('\n--- Inventory Transactions for Product 4945 ---');
        const transRes = await pool.query(`
            SELECT TransactionID, Quantity, TransactionType, ReferenceType, ReferenceID, CreatedAt
            FROM InventoryTransactions
            WHERE ProductID = $1
            ORDER BY CreatedAt DESC LIMIT 10
        `, [productId]);
        console.table(transRes.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkQuantities();

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log("--- INVESTIGATING: COTTO ROJO TERRE CUITE 45/45 ---");
        const product1 = await pool.query(`
            SELECT *
            FROM Products p 
            WHERE p.ProductName ILIKE '%COTTO ROJO TERRE CUITE 45/45%' AND p.productname NOT ILIKE '%FICHE%'
        `);
        console.log("Product:", product1.rows);

        if (product1.rows.length > 0) {
            const pid1 = product1.rows[0].productid;
            const inv1 = await pool.query(`SELECT * FROM Inventory WHERE productid = $1`, [pid1]);
            console.log("Inventory:", inv1.rows);

            const transactions1 = await pool.query(`SELECT * FROM InventoryTransactions WHERE productid = $1 ORDER BY transactionid ASC`, [pid1]);
            console.log("Transactions for COTTO:", transactions1.rows);

            const sales1 = await pool.query(`SELECT SUM(quantity) as total_sales FROM OrderItems WHERE productid = $1`, [pid1]);
            console.log("Total Sales:", sales1.rows[0].total_sales);

            const po1 = await pool.query(`SELECT SUM(receivedquantity) as total_po FROM PurchaseOrderItems WHERE productid = $1`, [pid1]);
            console.log("Total Received PO:", po1.rows[0].total_po);
        }

        console.log("\n--- INVESTIGATING: BERLIN MARON 20/75 ---");
        const product2 = await pool.query(`
            SELECT *
            FROM Products p 
            WHERE p.ProductName ILIKE '%BERLIN MARON 20/75%' AND p.productname NOT ILIKE '%FICHE%'
        `);
        console.log("Product:", product2.rows);

        if (product2.rows.length > 0) {
            const pid2 = product2.rows[0].productid;
            const inv2 = await pool.query(`SELECT * FROM Inventory WHERE productid = $1`, [pid2]);
            console.log("Inventory:", inv2.rows);

            const transactions2 = await pool.query(`SELECT * FROM InventoryTransactions WHERE productid = $1`, [pid2]);
            console.log("Transactions for BERLIN:", transactions2.rows);

            const sales2 = await pool.query(`SELECT SUM(quantity) as total_sales FROM OrderItems WHERE productid = $1`, [pid2]);
            console.log("Total Sales for BERLIN:", sales2.rows[0].total_sales);

            const po2 = await pool.query(`SELECT SUM(receivedquantity) as total_po FROM PurchaseOrderItems WHERE productid = $1`, [pid2]);
            console.log("Total Received PO:", po2.rows[0].total_po);
        }

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();

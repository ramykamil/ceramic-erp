const { Client } = require('pg');
const client = new Client('postgres://postgres:postgres@localhost:5432/ceramic_erp');

async function main() {
    await client.connect();
    
    // 1. Find Yacine ID
    const yacineRes = await client.query("SELECT CustomerID FROM Customers WHERE CustomerName ILIKE '%YACINE%'");
    console.log("Yacine IDs:", yacineRes.rows);
    
    if (yacineRes.rows.length === 0) return;
    const cid = yacineRes.rows[0].customerid;
    const start = '2000-01-01';
    const end = '2099-12-31';

    // 2. Summary count
    const summaryRes = await client.query(`
        SELECT COUNT(*) as cnt 
        FROM Orders 
        WHERE OrderDate BETWEEN $1 AND $2 
        AND Status != 'CANCELLED' 
        AND CustomerID = $3
    `, [start, end, cid]);
    console.log("Summary count:", summaryRes.rows[0].cnt);

    // 3. Transactions Query (as exactly as possible from code)
    const transactionsQuery = `
        SELECT o.OrderID, o.OrderNumber as numero, c.CustomerName as client, o.OrderDate as date
        FROM Orders o
        LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
        WHERE o.OrderDate BETWEEN $1 AND $2 
        AND o.Status != 'CANCELLED' 
        AND o.CustomerID = $3
        ORDER BY o.CreatedAt DESC
        LIMIT 100
    `;
    const transRes = await client.query(transactionsQuery, [start, end, cid]);
    console.log("Transactions count:", transRes.rows.length);
    if (transRes.rows.length > 0) {
        console.log("First transaction sample:", transRes.rows[0]);
    }

    await client.end();
}

main().catch(console.error);

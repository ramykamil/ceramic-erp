const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function check() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT oi.OrderItemID, oi.OrderID, oi.Quantity, u.UnitCode, oi.UnitPrice, o.OrderNumber, o.CreatedAt 
            FROM OrderItems oi 
            JOIN Orders o ON oi.OrderID = o.OrderID 
            LEFT JOIN Units u ON oi.UnitID = u.UnitID 
            WHERE oi.OrderID IN (1953, 1140, 1740) AND oi.ProductID = 3865
        `);
        console.table(res.rows);
    } finally {
        client.release();
        pool.end();
    }
}
check();

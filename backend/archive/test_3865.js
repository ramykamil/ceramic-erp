const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function run() {
    const client = await pool.connect();
    try {
        const txRes = await client.query(`
            SELECT TransactionType, Quantity, CreatedAt
            FROM InventoryTransactions 
            WHERE ProductID = 3865 AND WarehouseID = 1
        `);
        console.table(txRes.rows);
    } finally {
        client.release();
        pool.end();
    }
}
run();

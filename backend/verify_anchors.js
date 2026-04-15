const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function checkAnchors() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT COUNT(*) 
            FROM InventoryTransactions 
            WHERE CreatedAt::date = '2026-04-07' 
              AND Notes ILIKE '%Sync update%'
        `);
        console.log('Total "Sync update" transactions on 2026-04-07:', res.rows[0].count);
        
        const res2 = await client.query(`
            SELECT ProductID, Quantity, CreatedAt 
            FROM InventoryTransactions 
            WHERE CreatedAt::date = '2026-04-07' 
              AND Notes ILIKE '%Sync update%'
            LIMIT 5
        `);
        console.table(res2.rows);
    } finally {
        client.release();
        pool.end();
    }
}
checkAnchors();

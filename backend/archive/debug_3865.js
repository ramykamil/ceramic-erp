const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function run() {
    const client = await pool.connect();
    
    // 1. Get sync time
    const syncRes = await client.query(`
        SELECT CreatedAt FROM InventoryTransactions
        WHERE ProductID = 3865 AND ReferenceType IN ('CATALOGUE_SYNC', 'MANUAL_ADJUSTMENT')
        ORDER BY CreatedAt DESC LIMIT 1
    `);
    console.log('SyncRes:', syncRes.rows);
    
    let anchorTime = '2026-04-06 00:00:00';
    if (syncRes.rows.length > 0) {
        const syncDate = new Date(syncRes.rows[0].createdat);
        syncDate.setSeconds(syncDate.getSeconds() + 1);
        anchorTime = syncDate.toISOString();
    }
    console.log('AnchorTime:', anchorTime);
    
    // 2. Get txRes
    const txRes = await client.query(`
        SELECT TransactionType, Quantity, CreatedAt
        FROM InventoryTransactions 
        WHERE ProductID = 3865 
          AND WarehouseID = 1
          AND CreatedAt >= $1
          AND ReferenceType IN ('ORDER', 'PURCHASE')
    `, [anchorTime]);
    console.log('TxRes Length:', txRes.rows.length);
    console.log(txRes.rows);
    
    pool.end();
}
run();

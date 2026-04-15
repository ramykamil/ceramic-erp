const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function findRecentlyAffected() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT DISTINCT
                p.ProductID, 
                p.ProductName, 
                u.UnitCode as PrimaryUnit,
                i.QuantityOnHand as CurrentStock
            FROM Products p
            JOIN Units u ON p.PrimaryUnitID = u.UnitID
            JOIN Inventory i ON p.ProductID = i.ProductID AND i.WarehouseID = 1 AND i.OwnershipType = 'OWNED'
            JOIN InventoryTransactions it ON p.ProductID = it.ProductID
            WHERE (p.Size IS NOT NULL OR p.ProductName ~ '\\d+\\s*[xX*/]\\s*\\d+')
              AND u.UnitCode IN ('PCS', 'PIECE', 'PIÈCE')
              AND p.ProductName NOT ILIKE '%fiche%'
              AND it.CreatedAt >= '2026-04-06 00:00:00'
              AND it.ReferenceType IN ('ORDER', 'PURCHASE')
        `);
        
        console.log('=================================================================');
        console.log('  RECENTLY AFFECTED PRODUCTS (Transactions since April 6, 2026)');
        console.log('=================================================================\n');

        if (res.rows.length === 0) {
            console.log('No affected products found.');
        } else {
            console.table(res.rows);
            console.log('Total Affected Products since April 6: ' + res.rows.length);
        }
    } finally {
        client.release();
        pool.end();
    }
}
findRecentlyAffected();

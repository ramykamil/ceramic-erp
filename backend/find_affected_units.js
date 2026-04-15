const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function findAffectedProducts() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT p.ProductID, p.ProductName, p.ProductCode, u.UnitCode, i.QuantityOnHand
            FROM Products p
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID AND i.WarehouseID = 1 AND i.OwnershipType = 'OWNED'
            WHERE (p.Size IS NOT NULL OR p.ProductName ~ '\\d+\\s*[xX*/]\\s*\\d+')
              AND u.UnitCode IN ('PCS', 'PIECE', 'PIÈCE')
              AND p.ProductName NOT ILIKE '%fiche%'
        `);
        
        console.log('=================================================================');
        console.log('  POTENTIALLY AFFECTED PRODUCTS (Tiles set to PCS instead of M2)');
        console.log('=================================================================\n');

        if (res.rows.length === 0) {
            console.log('No affected products found.');
        } else {
            console.table(res.rows);
        }
    } finally {
        client.release();
        pool.end();
    }
}
findAffectedProducts();

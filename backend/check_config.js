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
            SELECT p.ProductID, p.ProductName, p.Size, p.QteParColis, p.QteColisParPalette, u.UnitCode as PrimaryUnit 
            FROM Products p 
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID 
            WHERE p.ProductID=3865
        `);
        console.table(res.rows);
    } finally {
        client.release();
        pool.end();
    }
}
check();

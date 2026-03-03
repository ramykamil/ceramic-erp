const { Client } = require('pg');
const client = new Client({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});
client.connect().then(async () => {
    const res = await client.query("SELECT ProductID, ProductName, ProductCode FROM Products WHERE ProductName ILIKE '%CONCRETE WHITE%' OR ProductName ILIKE '%CONCRETE GRIS%'");
    console.log(`Found ${res.rows.length} products:`, res.rows);
}).catch(console.error).finally(() => client.end());

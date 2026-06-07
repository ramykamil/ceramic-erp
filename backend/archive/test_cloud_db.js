const { Pool } = require('pg');
const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
});

async function main() {
    console.log("Connecting to cloud...");
    try {
        const res = await cloudPool.query('SELECT NOW()');
        console.log("Success! Time is:", res.rows[0]);

        console.log("Applying schema...");
        await cloudPool.query(`
      ALTER TABLE appsettings ADD COLUMN IF NOT EXISTS workstarttime VARCHAR(10) DEFAULT '08:00';
      ALTER TABLE appsettings ADD COLUMN IF NOT EXISTS workendtime VARCHAR(10) DEFAULT '18:00';
      ALTER TABLE appsettings ADD COLUMN IF NOT EXISTS allowedips TEXT DEFAULT '';
    `);
        console.log("Schema applied successfully!");

    } catch (err) {
        console.error("Connection/Query Error:", err);
    } finally {
        cloudPool.end();
        process.exit(0);
    }
}

main();

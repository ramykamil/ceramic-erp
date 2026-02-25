const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

async function run() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'CREATE_CATALOGUE_VIEW.sql'), 'utf8');
        await pool.query(sql);
        console.log('✅ View recreated successfully on Supabase.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error recreating view:', err);
        process.exit(1);
    }
}
run();

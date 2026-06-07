require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = {
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false },
};

const pool = new Pool(poolConfig);

pool.on('connect', () => {
    console.log('✓ Database connected successfully');
});

pool.query('SELECT NOW()')
    .then(res => {
        console.log(res.rows[0]);
        process.exit(0);
    })
    .catch(err => {
        console.error('Error connecting:', err.message);
        process.exit(1);
    });

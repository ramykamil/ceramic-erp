const { Pool, types } = require('pg');
require('dotenv').config();

// Override default date parsing mapping to return strings.
// 1082 is the OID for the Postgres "date" type.
// This prevents node-postgres from converting it to a local Date object, avoiding timezone shifts.
types.setTypeParser(1082, function (stringValue) {
  return stringValue; // Returns exactly 'YYYY-MM-DD'
});

// Use DATABASE_URL if available (standard for cloud providers like Render/Supabase/Neon)
// Fallback to local variables if not deployed
const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
  : {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('✓ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;


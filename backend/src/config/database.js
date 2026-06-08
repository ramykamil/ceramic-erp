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
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Increased timeout to 10 seconds (useful for cloud deployments)
  }
  : {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

const pool = new Pool(poolConfig);

const { tenantStorage } = require('../api/v1/utils/tenantContext');

// Override pool.query to scope queries
const originalPoolQuery = pool.query;
pool.query = async function (text, params) {
  const tenantId = tenantStorage.getStore();
  if (tenantId) {
    const client = await pool.connect();
    try {
      await client.query('SET app.current_tenant_id = $1', [tenantId]);
      const res = await client.query(text, params);
      return res;
    } finally {
      client.release();
    }
  }
  return originalPoolQuery.call(pool, text, params);
};

// Override pool.connect to return client with scoped client.query
const originalConnect = pool.connect;
pool.connect = async function () {
  const client = await originalConnect.call(pool);
  const originalClientQuery = client.query;
  
  client.query = async function (text, params) {
    const tenantId = tenantStorage.getStore();
    if (tenantId && text !== 'BEGIN' && text !== 'COMMIT' && text !== 'ROLLBACK') {
      await originalClientQuery.call(client, 'SET app.current_tenant_id = $1', [tenantId]);
    }
    return originalClientQuery.call(client, text, params);
  };
  
  return client;
};

pool.on('connect', () => {
  console.log('✓ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;


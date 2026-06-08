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

// Override pool.connect to return client with scoped client.query, supporting both promise and callback styles
const originalConnect = pool.connect;
pool.connect = function (callback) {
  if (callback) {
    return originalConnect.call(pool, (err, client, release) => {
      if (err) return callback(err, undefined, release);
      
      if (client && !client._scopedQueryOverridden) {
        client._scopedQueryOverridden = true;
        const originalClientQuery = client.query;
        client.query = function (text, params, cb) {
          const tenantId = tenantStorage.getStore();
          let actualCb = cb;
          if (typeof params === 'function') {
            actualCb = params;
          }
          
          if (tenantId && text !== 'BEGIN' && text !== 'COMMIT' && text !== 'ROLLBACK' && text !== "SELECT set_config('app.current_tenant_id', $1, false)") {
            if (actualCb) {
              originalClientQuery.call(client, "SELECT set_config('app.current_tenant_id', $1, false)", [tenantId], (err2) => {
                if (err2) return actualCb(err2);
                originalClientQuery.call(client, text, params, cb);
              });
              return;
            } else {
              return originalClientQuery.call(client, "SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
                .then(() => originalClientQuery.call(client, text, params));
            }
          }
          return originalClientQuery.call(client, text, params, cb);
        };
      }
      callback(null, client, release);
    });
  }

  // Promise style
  return originalConnect.call(pool).then(client => {
    if (client && !client._scopedQueryOverridden) {
      client._scopedQueryOverridden = true;
      const originalClientQuery = client.query;
      client.query = function (text, params, cb) {
        const tenantId = tenantStorage.getStore();
        let actualCb = cb;
        if (typeof params === 'function') {
          actualCb = params;
        }

        if (tenantId && text !== 'BEGIN' && text !== 'COMMIT' && text !== 'ROLLBACK' && text !== "SELECT set_config('app.current_tenant_id', $1, false)") {
          if (actualCb) {
            originalClientQuery.call(client, "SELECT set_config('app.current_tenant_id', $1, false)", [tenantId], (err2) => {
              if (err2) return actualCb(err2);
              originalClientQuery.call(client, text, params, cb);
            });
            return;
          } else {
            return originalClientQuery.call(client, "SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
              .then(() => originalClientQuery.call(client, text, params));
          }
        }
        return originalClientQuery.call(client, text, params, cb);
      };
    }
    return client;
  });
};

pool.on('connect', () => {
  console.log('✓ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;


/**
 * Database Abstraction Layer
 * Allows switching between PostgreSQL and SQLite based on environment
 * 
 * Usage:
 *   - Set DB_TYPE=sqlite in .env for SQLite (Electron/portable mode)
 *   - Set DB_TYPE=postgresql (or leave unset) for PostgreSQL (server mode)
 */

const dbType = process.env.DB_TYPE || 'postgresql';

let db;

if (dbType === 'sqlite') {
    // SQLite mode (for Electron/portable deployment)
    const sqlite = require('./sqlite');

    db = {
        query: sqlite.query,
        queryOne: sqlite.queryOne,
        transaction: sqlite.transaction,
        exec: sqlite.exec,
        close: sqlite.closeDatabase,
        initialize: sqlite.initializeDatabase,
        type: 'sqlite'
    };

    console.log('Database mode: SQLite (sql.js)');

    // Initialize database on startup
    sqlite.initializeDatabase().catch(err => {
        console.error('Failed to initialize SQLite database:', err);
    });

} else {
    // PostgreSQL mode (for server deployment)
    const { Pool } = require('pg');

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'allaoua_ceram',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    });

    db = {
        query: (sql, params) => pool.query(sql, params),
        queryOne: (sql, params) => pool.query(sql, params),
        transaction: async (fn) => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await fn(client);
                await client.query('COMMIT');
                return result;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        },
        exec: async (sql) => pool.query(sql),
        close: () => pool.end(),
        initialize: async () => { }, // No-op for PostgreSQL
        pool, // Expose pool for direct access if needed
        type: 'postgresql'
    };

    console.log('Database mode: PostgreSQL');
}

/**
 * Helper to convert PostgreSQL placeholders ($1, $2) to SQLite (?, ?)
 * Call this when you need to write queries that work on both databases
 */
function convertPlaceholders(sql) {
    if (dbType === 'sqlite') {
        // Replace $1, $2, etc. with ?
        return sql.replace(/\$(\d+)/g, '?');
    }
    return sql;
}

/**
 * Helper to get the appropriate RETURNING clause
 * PostgreSQL: RETURNING *
 * SQLite: needs lastInsertRowid from result
 */
function getReturningClause() {
    return dbType === 'postgresql' ? 'RETURNING *' : '';
}

/**
 * Helper to check if we're using SQLite
 */
function isSQLite() {
    return dbType === 'sqlite';
}

/**
 * Helper to check if we're using PostgreSQL
 */
function isPostgreSQL() {
    return dbType === 'postgresql';
}

module.exports = {
    ...db,
    convertPlaceholders,
    getReturningClause,
    isSQLite,
    isPostgreSQL,
    dbType
};

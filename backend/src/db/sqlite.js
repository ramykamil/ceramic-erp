/**
 * SQLite Database Connection Module using sql.js
 * Pure JavaScript implementation - works on any Node.js version
 * For portable Electron deployment (no PostgreSQL required)
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Determine database path
const dataDir = process.env.SQLITE_DATA_DIR || path.join(__dirname, '../data');
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'erp.db');

let db = null;
let SQL = null;

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Initialize sql.js and get/create database
 */
async function getDatabase() {
    if (db) return db;

    // Initialize sql.js
    if (!SQL) {
        SQL = await initSqlJs();
    }

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log(`SQLite database loaded: ${dbPath}`);
    } else {
        db = new SQL.Database();
        console.log(`SQLite database created: ${dbPath}`);
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    return db;
}

/**
 * Save database to disk
 */
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

/**
 * Close database and save
 */
function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        console.log('SQLite database closed');
    }
}

/**
 * Run a query and return all rows (similar to pg pool.query)
 */
async function query(sql, params = []) {
    const database = await getDatabase();

    try {
        // Check if it's a SELECT query
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT') ||
            sql.trim().toUpperCase().startsWith('WITH');

        if (isSelect) {
            const stmt = database.prepare(sql);
            stmt.bind(params);

            const rows = [];
            while (stmt.step()) {
                const row = stmt.getAsObject();
                rows.push(row);
            }
            stmt.free();

            return { rows };
        } else {
            database.run(sql, params);
            saveDatabase(); // Auto-save after writes

            // Get last insert rowid for INSERT statements
            let lastInsertRowid = null;
            if (sql.trim().toUpperCase().startsWith('INSERT')) {
                const result = database.exec('SELECT last_insert_rowid() as id');
                if (result.length > 0 && result[0].values.length > 0) {
                    lastInsertRowid = result[0].values[0][0];
                }
            }

            // Get changes count
            const changesResult = database.exec('SELECT changes() as count');
            const rowCount = changesResult.length > 0 ? changesResult[0].values[0][0] : 0;

            return {
                rows: [],
                rowCount,
                lastInsertRowid
            };
        }
    } catch (error) {
        console.error('SQLite query error:', error);
        console.error('SQL:', sql);
        console.error('Params:', params);
        throw error;
    }
}

/**
 * Run a query and return a single row
 */
async function queryOne(sql, params = []) {
    const result = await query(sql, params);
    return { rows: result.rows.slice(0, 1) };
}

/**
 * Execute multiple statements (for schema initialization)
 */
async function exec(sql) {
    const database = await getDatabase();
    database.exec(sql);
    saveDatabase();
}

/**
 * Transaction helper
 */
async function transaction(fn) {
    const database = await getDatabase();

    try {
        database.run('BEGIN TRANSACTION');
        const result = await fn({ query, queryOne, exec });
        database.run('COMMIT');
        saveDatabase();
        return result;
    } catch (error) {
        database.run('ROLLBACK');
        throw error;
    }
}

/**
 * Initialize database with schema if needed
 */
async function initializeDatabase() {
    const database = await getDatabase();
    const schemaPath = path.join(__dirname, 'schema.sql');

    if (fs.existsSync(schemaPath)) {
        // Check if database is empty (no tables)
        const tablesResult = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        const tables = tablesResult.length > 0 ? tablesResult[0].values : [];

        if (tables.length === 0) {
            console.log('Initializing database with schema...');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            database.exec(schema);
            saveDatabase();
            console.log('Database schema initialized successfully');
        } else {
            console.log(`Database already has ${tables.length} tables`);
        }
    }
}

// Auto-save every 30 seconds
setInterval(() => {
    if (db) {
        saveDatabase();
    }
}, 30000);

// Save on exit
process.on('exit', closeDatabase);
process.on('SIGINT', () => {
    closeDatabase();
    process.exit();
});
process.on('SIGTERM', () => {
    closeDatabase();
    process.exit();
});

module.exports = {
    getDatabase,
    closeDatabase,
    saveDatabase,
    query,
    queryOne,
    exec,
    transaction,
    initializeDatabase,
    dbPath
};

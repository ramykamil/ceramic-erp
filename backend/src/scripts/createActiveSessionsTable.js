const pool = require('../config/database');

async function runSchema() {
    try {
        console.log("🛠️ Creating ActiveSessions Table...");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS ActiveSessions (
                SessionID SERIAL PRIMARY KEY,
                UserID INT NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
                IPAddress VARCHAR(45),
                UserAgent TEXT,
                LoginTime TIMESTAMP DEFAULT NOW(),
                LastActive TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log("✅ ActiveSessions Table created or already exists.");

    } catch (error) {
        console.error("❌ Error creating table:", error);
    } finally {
        await pool.end();
    }
}

runSchema();

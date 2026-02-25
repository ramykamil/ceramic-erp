const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Explicit config to avoid connection issues
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ceramic_erp',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting Phase 6 Migration (HR & Payroll)...');
        await client.query('BEGIN');

        // Create Attendance Table
        console.log('Creating Attendance table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS Attendance (
        AttendanceID SERIAL PRIMARY KEY,
        EmployeeID INTEGER REFERENCES Employees(EmployeeID),
        CheckInTime TIMESTAMP NOT NULL,
        CheckOutTime TIMESTAMP,
        Date DATE NOT NULL DEFAULT CURRENT_DATE,
        Status VARCHAR(20) CHECK (Status IN ('PRESENT', 'LATE', 'LEFT_EARLY', 'ABSENT')) DEFAULT 'PRESENT',
        Notes TEXT
      );
    `);

        await client.query('COMMIT');
        console.log('Migration completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();

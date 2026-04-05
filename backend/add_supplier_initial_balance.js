
const pool = require('./src/config/database');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log("Adding InitialBalance to Brands...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='initialbalance') THEN
                    ALTER TABLE Brands ADD COLUMN InitialBalance NUMERIC(15, 2) DEFAULT 0.00;
                END IF;
            END
            $$;
        `);

        console.log("Adding InitialBalance to Factories...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factories' AND column_name='initialbalance') THEN
                    ALTER TABLE Factories ADD COLUMN InitialBalance NUMERIC(15, 2) DEFAULT 0.00;
                END IF;
            END
            $$;
        `);

        await client.query('COMMIT');
        console.log("Migration complete.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}
run();

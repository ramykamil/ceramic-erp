const pool = require('./src/config/database');

async function checkPgCron() {
    await pool.connect();
    try {
        const res = await pool.query("SELECT * FROM cron.job");
        console.log("pg_cron jobs:", res.rows);
    } catch (e) {
        console.log("pg_cron not found or no access:", e.message);
    }

    try {
        const res2 = await pool.query("SELECT * FROM pg_stat_activity WHERE backend_type LIKE '%worker%' OR backend_type LIKE '%cron%' OR application_name LIKE '%cron%'");
        console.log("Background workers:", res2.rows.map(r => r.backend_type + " | " + r.application_name));
    } catch (e) {
        console.log("pg_stat_activity error:", e.message);
    }
    pool.end();
}
checkPgCron();

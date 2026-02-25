const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./src/config/database');

async function checkUsers() {
    try {
        console.log("Fetching Users...");
        const users = await pool.query('SELECT UserID, Username, Email FROM Users ORDER BY UserID');
        console.table(users.rows);

        console.log("\nChecking Sequence...");
        const seq = await pool.query("SELECT last_value FROM users_userid_seq");
        console.log("Current Sequence Value:", seq.rows[0].last_value);

        const maxId = await pool.query("SELECT MAX(UserID) as maxid FROM Users");
        console.log("Actual Max UserID:", maxId.rows[0].maxid);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkUsers();

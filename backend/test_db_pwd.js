const { Client } = require('pg');

const testPasswords = [
    "\"p3yf+XV7'EMz^#",
    "p3yf+XV7'EMz^#",
    "%22p3yf%2BXV7'EMz%5E%23"
];

async function run() {
    for (const pwd of testPasswords) {
        console.log(`Testing password: ${pwd}`);
        const client = new Client({
            host: 'aws-1-eu-central-1.pooler.supabase.com',
            port: 6543,
            database: 'postgres',
            user: 'postgres.ugvioyruqoafvsqvnwiy',
            password: pwd,
            ssl: { rejectUnauthorized: false }
        });
        try {
            await client.connect();
            console.log(`SUCCESS with password: ${pwd}`);
            await client.end();
            return;
        } catch (err) {
            console.log(`Failed: ${err.message}`);
        }
    }
}
run();

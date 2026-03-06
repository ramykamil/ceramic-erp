require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('--- STARTING LEDGER WIPE ---');

        // 1. Delete all CashTransactions (payments/versements)
        const delTxns = await client.query('DELETE FROM CashTransactions');
        console.log(`✓ Deleted ${delTxns.rowCount} CashTransactions.`);

        // 2. Reset all Client Balances to 0
        const resetClients = await client.query('UPDATE Customers SET CurrentBalance = 0');
        console.log(`✓ Reset CurrentBalance to 0 for ${resetClients.rowCount} Customers.`);

        // 3. Reset all Supplier Balances to 0 (optional, but good for a full fresh start)
        const resetBrands = await client.query('UPDATE Brands SET CurrentBalance = 0');
        console.log(`✓ Reset CurrentBalance to 0 for ${resetBrands.rowCount} Brands (Suppliers).`);

        const resetFactories = await client.query('UPDATE Factories SET CurrentBalance = 0');
        console.log(`✓ Reset CurrentBalance to 0 for ${resetFactories.rowCount} Factories (Suppliers).`);

        // 4. (Optional) Reset Cash Accounts to 0
        const resetAccounts = await client.query('UPDATE CashAccounts SET Balance = 0');
        console.log(`✓ Reset Balance to 0 for ${resetAccounts.rowCount} CashAccounts.`);

        await client.query('COMMIT');

        // Refresh materialized views if they exist to reflect 0 balances
        try {
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('✓ Refreshed mv_Catalogue');
        } catch (e) {
            // Ignore if it doesn't exist
        }

        console.log('--- WIPE COMPLETE ---');
        console.log('All ledgers are now at zero. You can start entering initial balances manually.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error during wipe:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();

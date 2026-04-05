require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function safeParse(val) {
    if (!val) return null;
    try {
        return JSON.parse(val);
    } catch (e) {
        return val;
    }
}

async function run() {
    const client = await pool.connect();
    try {
        const customerIds = [12, 28, 36, 85, 104, 118];

        for (const cid of customerIds) {
            console.log(`\n============================`);
            console.log(`Investigating Customer ID: ${cid}`);
            const custRes = await client.query('SELECT CustomerName, CurrentBalance FROM Customers WHERE CustomerID = $1', [cid]);
            console.log(`Current State: ${custRes.rows[0].customername} | Balance: ${custRes.rows[0].currentbalance}`);

            // Check Audit Logs
            const auditRes = await client.query(`
        SELECT Action, OldValues, NewValues, CreatedAt 
        FROM AuditLogs 
        WHERE TableName = 'Customers' AND RecordID = $1
        ORDER BY CreatedAt DESC
      `, [cid]);

            if (auditRes.rows.length > 0) {
                console.log(`\nAudit History for Customer ${cid}:`);
                for (const row of auditRes.rows) {
                    const oldVal = safeParse(row.oldvalues);
                    const newVal = safeParse(row.newvalues);

                    let oldBalance = oldVal && oldVal.currentbalance !== undefined ? oldVal.currentbalance : 'N/A';
                    let newBalance = newVal && newVal.currentbalance !== undefined ? newVal.currentbalance : 'N/A';

                    console.log(`- ${row.createdat.toISOString()} | ${row.action} | Old Balance: ${oldBalance} -> New Balance: ${newBalance}`);
                }
            } else {
                console.log(`No direct customer audit logs found for Customer ${cid}. Checking Order logs instead...`);

                const orderAuditRes = await client.query(`
            SELECT Action, OldValues, NewValues, CreatedAt 
            FROM AuditLogs 
            WHERE TableName = 'Orders' 
              AND NewValues::jsonb ->> 'customerid' = $1::text
            ORDER BY CreatedAt DESC
          `, [cid]);

                for (const row of orderAuditRes.rows) {
                    console.log(`- ${row.createdat.toISOString()} | ORDER ${row.action}`);
                }
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();

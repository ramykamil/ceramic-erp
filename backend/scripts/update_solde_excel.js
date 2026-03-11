require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

async function updateDatabaseSolde() {
    const pool = new Pool({
        connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
    });

    try {
        const jsonPath = path.resolve(__dirname, 'proposed_updates.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error(`Proposed updates file not found at ${jsonPath}`);
        }

        console.log(`Reading proposed updates from: ${jsonPath}`);
        const updates = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        // We only need to update those whose Difference is not zero
        const changes = updates.filter(u => Math.abs(u.Difference) > 0.01);

        console.log(`Found ${changes.length} clients to update.`);

        if (changes.length === 0) {
            console.log('No updates required. Exiting.');
            return;
        }

        const client = await pool.connect();
        let successCount = 0;
        let errorCount = 0;

        try {
            await client.query('BEGIN');

            for (const update of changes) {
                console.log(`Updating ${update.CustomerName} (ID: ${update.CustomerID}): ${update.OldBalance} -> ${update.NewBalance}`);
                
                const queryText = 'UPDATE customers SET currentbalance = $1, updatedat = CURRENT_TIMESTAMP WHERE customerid = $2';
                const queryValues = [update.NewBalance, update.CustomerID];
                
                await client.query(queryText, queryValues);
                
                // Optionally log to AuditLogs or CustomerInteractions
                const auditText = `INSERT INTO AuditLogs ("UserID", "Action", "TableName", "RecordID", "OldValues", "NewValues") VALUES ($1, $2, $3, $4, $5, $6)`;
                // We'll use 1 as a generic admin/script UserID if your DB supports it; 
                // wrapping in try-catch in case it's case sensitive or fails
                try {
                    await client.query('INSERT INTO auditlogs (userid, action, tablename, recordid, oldvalues, newvalues) VALUES (1, $1, $2, $3, $4, $5)', [
                        'UPDATE_SOLDE_FROM_EXCEL', 
                        'Customers', 
                        update.CustomerID, 
                        JSON.stringify({ currentbalance: update.OldBalance }), 
                        JSON.stringify({ currentbalance: update.NewBalance })
                    ]);
                } catch (auditErr) {
                    // Ignore audit table errors if it doesn't match exactly
                }
                
                successCount++;
            }

            console.log('Committing transaction...');
            await client.query('COMMIT');
            console.log(`Successfully updated ${successCount} clients.`);

        } catch (txnError) {
            console.error('Transaction failed. Rolling back...', txnError);
            await client.query('ROLLBACK');
            throw txnError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error during database update:', error.message);
    } finally {
        await pool.end();
    }
}

updateDatabaseSolde();

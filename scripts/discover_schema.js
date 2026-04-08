const pool = require('../backend/src/config/database');

async function discover() {
    try {
        const res = await pool.query("SELECT * FROM InventoryTransactions LIMIT 1");
        console.log("Columns in InventoryTransactions:", Object.keys(res.rows[0]));
        
        const adj = await pool.query("SELECT * FROM InventoryTransactions WHERE TransactionType = 'ADJUSTMENT' ORDER BY CreatedAt DESC LIMIT 5");
        console.log("Sample adjustments:", JSON.stringify(adj.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

discover();

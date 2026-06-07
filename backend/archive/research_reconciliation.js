const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function research() {
    try {
        console.log('--- Database Schema & Transaction Research ---');

        // 1. Identify all ReferenceTypes in InventoryTransactions
        const refTypes = await pool.query('SELECT DISTINCT ReferenceType FROM InventoryTransactions');
        console.log('\nExisting ReferenceTypes:');
        console.table(refTypes.rows);

        // 2. Check Order Statuses (to find how deleted orders are marked)
        const orderStatuses = await pool.query('SELECT DISTINCT Status FROM Orders');
        console.log('\nOrder Statuses:');
        console.table(orderStatuses.rows);

        // 3. Check for specific return types
        const returnTypes = await pool.query("SELECT DISTINCT ReferenceType FROM InventoryTransactions WHERE ReferenceType ILIKE '%return%'");
        console.log('\nReturn-related ReferenceTypes:');
        console.table(returnTypes.rows);

        // 4. Verify specific anchor for BARCELONA (3549)
        const anchor = await pool.query("SELECT Quantity, CreatedAt, Notes FROM InventoryTransactions WHERE ProductID = 3549 AND Notes ILIKE '%Sync update%' LIMIT 1");
        console.log('\nExample Anchor (BARCELONA):');
        console.table(anchor.rows);

        // 5. Look for deleted flags in Orders and PurchaseOrders
        const orderColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Orders' AND column_name IN ('IsDeleted', 'isdeleted', 'status', 'Status')");
        console.log('\nDeletion columns in Orders:');
        console.table(orderColumns.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

research();

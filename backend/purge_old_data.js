/**
 * PURGE ALL TRANSACTIONAL DATA BEFORE 03-03-2026
 * ================================================
 * Deletes all orders, invoices, payments, goods receipts, purchase orders,
 * inventory transactions, and related records from before the cutoff date.
 * Then recalculates all customer balances from the remaining data.
 * 
 * Runs inside a single PostgreSQL transaction (all-or-nothing).
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const CUTOFF = '2026-03-03 00:00:00';

async function safeDelete(client, label, sql, params = []) {
    try {
        const result = await client.query(sql, params);
        console.log(`  ✓ ${label}: ${result.rowCount} rows deleted`);
        return result.rowCount;
    } catch (err) {
        if (err.code === '42P01') { // undefined_table
            console.log(`  ⊘ ${label}: table does not exist, skipping`);
            return 0;
        }
        throw err;
    }
}

async function safeCount(client, table) {
    try {
        const r = await client.query(`SELECT COUNT(*) as c FROM ${table}`);
        return parseInt(r.rows[0].c);
    } catch (err) {
        return -1; // table doesn't exist
    }
}

async function main() {
    const client = await pool.connect();

    try {
        // ── PRE-PURGE COUNTS ────────────────────────────────────
        console.log('='.repeat(60));
        console.log('  PRE-PURGE RECORD COUNTS');
        console.log('='.repeat(60));
        const tables = ['Orders', 'OrderItems', 'Invoices', 'Payments', 'PaymentAllocations',
            'AccountingEntries', 'GoodsReceipts', 'GoodsReceiptItems', 'PurchaseOrders',
            'PurchaseOrderItems', 'InventoryTransactions', 'CashTransactions',
            'FactorySettlements', 'SettlementItems', 'Returns', 'ReturnItems', 'Deliveries'];

        const before = {};
        for (const t of tables) {
            before[t] = await safeCount(client, t);
            if (before[t] >= 0) console.log(`  ${t}: ${before[t]}`);
        }

        // ── COUNT WHAT WILL BE DELETED ──────────────────────────
        console.log('\n' + '='.repeat(60));
        console.log('  RECORDS TO DELETE (before ' + CUTOFF + ')');
        console.log('='.repeat(60));

        const oldOrders = await client.query('SELECT COUNT(*) as c FROM Orders WHERE CreatedAt < $1', [CUTOFF]);
        const newOrders = await client.query('SELECT COUNT(*) as c FROM Orders WHERE CreatedAt >= $1', [CUTOFF]);
        console.log(`  Orders to DELETE: ${oldOrders.rows[0].c}`);
        console.log(`  Orders to KEEP:   ${newOrders.rows[0].c}`);

        const oldGR = await client.query('SELECT COUNT(*) as c FROM GoodsReceipts WHERE CreatedAt < $1', [CUTOFF]);
        const newGR = await client.query('SELECT COUNT(*) as c FROM GoodsReceipts WHERE CreatedAt >= $1', [CUTOFF]);
        console.log(`  GoodsReceipts to DELETE: ${oldGR.rows[0].c}`);
        console.log(`  GoodsReceipts to KEEP:   ${newGR.rows[0].c}`);

        const oldIT = await client.query('SELECT COUNT(*) as c FROM InventoryTransactions WHERE CreatedAt < $1', [CUTOFF]);
        const newIT = await client.query('SELECT COUNT(*) as c FROM InventoryTransactions WHERE CreatedAt >= $1', [CUTOFF]);
        console.log(`  InventoryTransactions to DELETE: ${oldIT.rows[0].c}`);
        console.log(`  InventoryTransactions to KEEP:   ${newIT.rows[0].c}`);

        // ── BEGIN TRANSACTION ───────────────────────────────────
        console.log('\n' + '='.repeat(60));
        console.log('  EXECUTING PURGE');
        console.log('='.repeat(60));
        await client.query('BEGIN');

        // 1. FINANCIAL LAYER (leaf tables first)
        console.log('\n--- 1. Financial Layer ---');
        await safeDelete(client, 'CashTransactions',
            'DELETE FROM CashTransactions WHERE CreatedAt < $1', [CUTOFF]);

        // PaymentAllocations for old payments
        await safeDelete(client, 'PaymentAllocations',
            'DELETE FROM PaymentAllocations WHERE PaymentID IN (SELECT PaymentID FROM Payments WHERE CreatedAt < $1)', [CUTOFF]);

        await safeDelete(client, 'Payments',
            'DELETE FROM Payments WHERE CreatedAt < $1', [CUTOFF]);

        await safeDelete(client, 'AccountingEntries',
            'DELETE FROM AccountingEntries WHERE CreatedAt < $1', [CUTOFF]);

        // 2. SETTLEMENTS / RETURNS / DELIVERIES
        console.log('\n--- 2. Settlements / Returns / Deliveries ---');
        await safeDelete(client, 'SettlementItems',
            'DELETE FROM SettlementItems WHERE SettlementID IN (SELECT SettlementID FROM FactorySettlements WHERE CreatedAt < $1)', [CUTOFF]);

        await safeDelete(client, 'FactorySettlements',
            'DELETE FROM FactorySettlements WHERE CreatedAt < $1', [CUTOFF]);

        await safeDelete(client, 'ReturnItems',
            'DELETE FROM ReturnItems WHERE ReturnID IN (SELECT ReturnID FROM Returns WHERE CreatedAt < $1)', [CUTOFF]);

        await safeDelete(client, 'Returns',
            'DELETE FROM Returns WHERE CreatedAt < $1', [CUTOFF]);

        await safeDelete(client, 'Deliveries',
            'DELETE FROM Deliveries WHERE CreatedAt < $1', [CUTOFF]);

        // 3. SALES (Invoices → OrderItems → Orders)
        console.log('\n--- 3. Sales ---');
        await safeDelete(client, 'Invoices (for old orders)',
            'DELETE FROM Invoices WHERE OrderID IN (SELECT OrderID FROM Orders WHERE CreatedAt < $1)', [CUTOFF]);

        // OrderItems cascade from Orders (ON DELETE CASCADE), but let's be explicit
        await safeDelete(client, 'OrderItems (for old orders)',
            'DELETE FROM OrderItems WHERE OrderID IN (SELECT OrderID FROM Orders WHERE CreatedAt < $1)', [CUTOFF]);

        await safeDelete(client, 'Orders',
            'DELETE FROM Orders WHERE CreatedAt < $1', [CUTOFF]);

        // 4. PURCHASES / STOCK
        console.log('\n--- 4. Purchases / Stock ---');
        await safeDelete(client, 'GoodsReceiptItems',
            'DELETE FROM GoodsReceiptItems WHERE ReceiptID IN (SELECT ReceiptID FROM GoodsReceipts WHERE CreatedAt < $1)', [CUTOFF]);

        await safeDelete(client, 'GoodsReceipts',
            'DELETE FROM GoodsReceipts WHERE CreatedAt < $1', [CUTOFF]);

        await safeDelete(client, 'PurchaseOrderItems',
            'DELETE FROM PurchaseOrderItems WHERE PurchaseOrderID IN (SELECT PurchaseOrderID FROM PurchaseOrders WHERE CreatedAt < $1)', [CUTOFF]);

        await safeDelete(client, 'PurchaseOrders',
            'DELETE FROM PurchaseOrders WHERE CreatedAt < $1', [CUTOFF]);

        await safeDelete(client, 'InventoryTransactions',
            'DELETE FROM InventoryTransactions WHERE CreatedAt < $1', [CUTOFF]);

        // 5. RECALCULATE CUSTOMER BALANCES
        console.log('\n--- 5. Recalculating Customer Balances ---');

        // Balance = Total of CONFIRMED orders - Total payments (post-cutoff only)
        const balanceResult = await client.query(`
            UPDATE Customers c SET
                CurrentBalance = (
                    COALESCE((SELECT SUM(TotalAmount) FROM Orders WHERE CustomerID = c.CustomerID AND Status = 'CONFIRMED'), 0)
                    -
                    COALESCE((SELECT SUM(Amount) FROM Payments WHERE CustomerID = c.CustomerID), 0)
                ),
                UpdatedAt = CURRENT_TIMESTAMP
        `);
        console.log(`  ✓ Customer balances recalculated: ${balanceResult.rowCount} customers`);

        // Also reset CashAccounts if they exist
        try {
            await client.query("UPDATE CashAccounts SET Balance = 0.00, UpdatedAt = CURRENT_TIMESTAMP");
            console.log('  ✓ CashAccounts balances reset');
        } catch (err) {
            if (err.code !== '42P01') throw err;
        }

        // ── COMMIT ──────────────────────────────────────────────
        await client.query('COMMIT');
        console.log('\n✅ PURGE COMMITTED SUCCESSFULLY');

        // ── POST-PURGE COUNTS ───────────────────────────────────
        console.log('\n' + '='.repeat(60));
        console.log('  POST-PURGE RECORD COUNTS');
        console.log('='.repeat(60));
        for (const t of tables) {
            const after = await safeCount(client, t);
            if (after >= 0) {
                const deleted = before[t] - after;
                console.log(`  ${t}: ${after} (deleted ${deleted})`);
            }
        }

        // Refresh MV
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('\nMV Catalogue refreshed.');
        } catch (e) { /* ignore */ }

        console.log('\n✅ ALL DONE. System now has a clean baseline from 03-03-2026.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ ERROR — ROLLED BACK:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

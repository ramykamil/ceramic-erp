/**
 * Cleanup Script for Fresh Start on New Computer
 * 
 * This script will:
 * 1. Delete all OrderItems
 * 2. Delete all Orders
 * 3. Delete all Invoices
 * 4. Delete all InventoryTransactions
 * 5. Delete all Inventory records
 * 6. Reset the orders sequence
 * 
 * It PRESERVES:
 * - Users
 * - Products (structure only, inventory cleared)
 * - Customers
 * - Warehouses
 * - Brands, Categories, Units
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../config/database');

async function cleanup() {
    const client = await pool.connect();

    try {
        console.log('\n🧹 Starting Cleanup for Fresh Start...\n');

        await client.query('BEGIN');

        // 1. Delete OrderItems (child of Orders)
        const orderItemsResult = await client.query('DELETE FROM OrderItems');
        console.log(`✓ Deleted ${orderItemsResult.rowCount} order items`);

        // 2. Delete Deliveries (if they reference orders)
        try {
            const deliveriesResult = await client.query('DELETE FROM Deliveries');
            console.log(`✓ Deleted ${deliveriesResult.rowCount} deliveries`);
        } catch (e) {
            console.log('⚠ Deliveries table may not exist, skipping...');
        }

        // 3. Delete Invoices
        const invoicesResult = await client.query('DELETE FROM Invoices');
        console.log(`✓ Deleted ${invoicesResult.rowCount} invoices`);

        // 4. Delete Orders
        const ordersResult = await client.query('DELETE FROM Orders');
        console.log(`✓ Deleted ${ordersResult.rowCount} orders`);

        // 5. Delete InventoryTransactions
        const transResult = await client.query('DELETE FROM InventoryTransactions');
        console.log(`✓ Deleted ${transResult.rowCount} inventory transactions`);

        // 6. Delete Inventory records
        const inventoryResult = await client.query('DELETE FROM Inventory');
        console.log(`✓ Deleted ${inventoryResult.rowCount} inventory records`);

        // 7. Reset the orders sequence to start fresh
        await client.query('ALTER SEQUENCE orders_seq RESTART WITH 1');
        console.log('✓ Reset order sequence to 1');

        await client.query('COMMIT');

        console.log('\n✅ Cleanup completed successfully!');
        console.log('📦 You can now import new inventory via the Inventory page.\n');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Cleanup failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

cleanup().catch(err => {
    console.error(err);
    process.exit(1);
});

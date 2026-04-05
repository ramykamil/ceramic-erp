/**
 * RESET ALL DATA SCRIPT
 * This script resets:
 * - All sales (orders, invoices, payments)
 * - All purchases (purchase orders, goods receipts)
 * - All inventory transactions
 * - All customer/supplier balances to 0
 */

const pool = require('./src/config/database');

async function resetAllData() {
    const client = await pool.connect();

    try {
        console.log('🚨 STARTING FULL DATA RESET...\n');

        await client.query('BEGIN');

        // 1. Delete all payments and payment allocations
        console.log('💰 Resetting payments...');
        await client.query('DELETE FROM paymentallocations');
        await client.query('DELETE FROM payments');
        console.log('   ✓ Payments cleared');

        // 2. Delete all returns
        console.log('🔄 Resetting returns...');
        await client.query('DELETE FROM returnitems');
        await client.query('DELETE FROM returns');
        console.log('   ✓ Returns cleared');

        // 3. Delete all orders/sales
        console.log('🛒 Resetting sales/orders...');
        await client.query('DELETE FROM orderitems');
        await client.query('DELETE FROM deliveries');
        await client.query('DELETE FROM invoices');
        await client.query('DELETE FROM orders');
        console.log('   ✓ Sales/Orders cleared');

        // 4. Delete all purchases
        console.log('📦 Resetting purchases...');
        await client.query('DELETE FROM settlementitems');
        await client.query('DELETE FROM settlements');
        await client.query('DELETE FROM factorysettlements');
        await client.query('DELETE FROM goodsreceiptitems');
        await client.query('DELETE FROM goodsreceipts');
        await client.query('DELETE FROM purchaseorderitems');
        await client.query('DELETE FROM purchaseorders');
        console.log('   ✓ Purchases cleared');

        // 5. Delete all inventory transactions
        console.log('📊 Resetting inventory...');
        await client.query('DELETE FROM inventorytransactions');
        await client.query('DELETE FROM inventory');
        await client.query('DELETE FROM quickstockitems');
        console.log('   ✓ Inventory cleared');

        // 6. Reset cash transactions and accounting
        console.log('💵 Resetting cash & accounting...');
        await client.query('DELETE FROM cashtransactions');
        await client.query('DELETE FROM accountingentries');
        // Try to reset balance if column exists
        try {
            await client.query('UPDATE cashaccounts SET balance = 0');
        } catch (e) {
            // Column might not exist or have different name
            console.log('   (cashaccounts balance column not found, skipping)');
        }
        console.log('   ✓ Cash & Accounting cleared');

        // 7. Reset customer balances to 0
        console.log('👥 Resetting customer balances...');
        await client.query('UPDATE customers SET currentbalance = 0');
        const custResult = await client.query('SELECT COUNT(*) as count FROM customers');
        console.log(`   ✓ ${custResult.rows[0].count} customer balances reset to 0`);

        // 8. Reset brand balances to 0
        console.log('🏷️ Resetting brand balances...');
        await client.query('UPDATE brands SET currentbalance = 0, initialbalance = 0');
        const brandResult = await client.query('SELECT COUNT(*) as count FROM brands');
        console.log(`   ✓ ${brandResult.rows[0].count} brand balances reset to 0`);

        // 9. Reset factory balances to 0
        console.log('🏭 Resetting factory balances...');
        await client.query('UPDATE factories SET currentbalance = 0, initialbalance = 0');
        const factoryResult = await client.query('SELECT COUNT(*) as count FROM factories');
        console.log(`   ✓ ${factoryResult.rows[0].count} factory balances reset to 0`);

        // 10. Clear audit logs (optional but recommended for fresh start)
        console.log('📜 Clearing audit logs...');
        await client.query('DELETE FROM auditlogs');
        console.log('   ✓ Audit logs cleared');

        await client.query('COMMIT');

        console.log('\n✅ ==========================================');
        console.log('✅ ALL DATA HAS BEEN RESET SUCCESSFULLY!');
        console.log('✅ ==========================================');
        console.log('\n📋 Summary:');
        console.log('   • All sales/orders deleted');
        console.log('   • All purchases deleted');
        console.log('   • All inventory cleared');
        console.log('   • All payments deleted');
        console.log('   • All customer balances = 0');
        console.log('   • All supplier balances = 0');
        console.log('\n🎉 Your system is ready for a fresh start!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ ERROR! Transaction rolled back.');
        console.error('Error details:', error.message);
    } finally {
        client.release();
        pool.end();
    }
}

resetAllData();

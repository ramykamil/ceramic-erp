/**
 * Fix: Restore order dates for orders that were incorrectly changed to today's date
 * when they were edited via the POS page.
 * 
 * Run: node fix-order-dates.js
 */
const pool = require('./src/config/database');

async function fix() {
    try {
        const result = await pool.query(`
      UPDATE Orders 
      SET OrderDate = '2026-03-05' 
      WHERE OrderNumber IN ('ORD-2026-000565', 'ORD-2026-000510', 'ORD-2026-000487')
      RETURNING OrderNumber, OrderDate
    `);
        console.log('✅ Restored order dates:');
        result.rows.forEach(r => console.log(`  ${r.ordernumber} → ${r.orderdate}`));
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
    }
}

fix();

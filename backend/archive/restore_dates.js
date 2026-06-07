const pool = require('./src/config/database');

async function fix() {
    try {
        const result = await pool.query(`
      UPDATE Orders 
      SET OrderDate = '2026-03-05' 
      WHERE OrderNumber IN ('ORD-2026-000596', 'ORD-2026-000565', 'ORD-2026-000510')
      RETURNING OrderNumber, OrderDate, UpdatedAt
    `);
        console.log('✅ Restored order dates back to original (05-03-2026):');
        result.rows.forEach(r => console.log('  ' + r.ordernumber + ' -> ' + r.orderdate + ' ' + r.updatedat));
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
    }
}

fix();

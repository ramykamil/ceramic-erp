require('dotenv').config();
const pool = require('./src/config/database');

async function main() {
    // 1. Find all products where ALL stock is reserved (quantityavailable = 0 but quantityonhand > 0)
    console.log('=== Products with ALL stock reserved (qty > 0 but available = 0) ===');
    const res = await pool.query(`
        SELECT p.ProductCode, p.ProductName, 
               i.QuantityOnHand, i.QuantityReserved, i.QuantityAvailable,
               i.PalletCount, i.ColisCount
        FROM Products p
        JOIN Inventory i ON p.ProductID = i.ProductID
        WHERE i.QuantityOnHand > 0 
        AND i.QuantityAvailable <= 0
        AND p.IsActive = true
        ORDER BY i.QuantityOnHand DESC
    `);
    console.log(`Found ${res.rows.length} products with stock but 0 available`);
    res.rows.forEach(r => {
        console.log(`  ${r.productcode} | OnHand: ${r.quantityonhand} | Reserved: ${r.quantityreserved} | Available: ${r.quantityavailable}`);
    });

    // 2. Check total quantity reserved vs on-hand across ALL inventory
    console.log('\n=== Overall reserved stock summary ===');
    const sumRes = await pool.query(`
        SELECT 
            COUNT(*) as total_records,
            SUM(CASE WHEN QuantityOnHand > 0 AND QuantityAvailable <= 0 THEN 1 ELSE 0 END) as fully_reserved,
            SUM(CASE WHEN QuantityReserved > 0 THEN 1 ELSE 0 END) as has_reservations,
            SUM(QuantityOnHand) as total_onhand,
            SUM(QuantityReserved) as total_reserved
        FROM Inventory
    `);
    console.log(JSON.stringify(sumRes.rows[0], null, 2));

    await pool.end();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

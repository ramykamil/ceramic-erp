const pool = require('./backend/src/config/database');

async function debugOrderStock(orderId) {
  const client = await pool.connect();
  try {
    const itemsResult = await client.query(`
      SELECT oi.*, p.ProductName, p.ProductCode, p.Size, p.QteParColis, 
             u.UnitCode, pu.UnitCode as PrimaryUnitCode
      FROM OrderItems oi
      JOIN Products p ON oi.ProductID = p.ProductID
      JOIN Units u ON oi.UnitID = u.UnitID
      LEFT JOIN Units pu ON p.PrimaryUnitID = pu.UnitID
      WHERE oi.OrderID = $1
    `, [orderId]);

    console.log(`Order ${orderId} has ${itemsResult.rows.length} items.`);

    for (const item of itemsResult.rows) {
      console.log(`\nProduct: ${item.productname} (ID: ${item.productid})`);
      console.log(`Ordered Qty: ${item.quantity} ${item.unitcode}`);
      
      const inv = await client.query(
        'SELECT * FROM Inventory WHERE ProductID = $1',
        [item.productid]
      );
      
      if (inv.rows.length === 0) {
        console.log('--- NO INVENTORY RECORD FOUND ---');
      } else {
        inv.rows.forEach(row => {
          console.log(`--- Inventory (WH: ${row.warehouseid}, Type: ${row.ownershiptype}) ---`);
          console.log(`    OnHand: ${row.quantityonhand}`);
          console.log(`    Reserved: ${row.quantityreserved}`);
          console.log(`    Available: ${row.quantityonhand - row.quantityreserved}`);
        });
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    process.exit();
  }
}

// Pass orderId as argument
const orderId = process.argv[2];
if (!orderId) {
  console.log('Usage: node debug_order_stock.js <orderId>');
  process.exit();
}
debugOrderStock(orderId);

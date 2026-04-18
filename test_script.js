const pool = require('./backend/src/config/database.js');

async function test() {
  const result = await pool.query("SELECT p.ProductCode, p.ProductName, u.UnitCode as PrimaryUnitCode, i.QuantityOnHand FROM Products p JOIN Inventory i ON p.ProductID = i.ProductID LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID WHERE p.ProductName LIKE '%ATLANTIC STONE 45/45%'");
  console.log(result.rows);
  process.exit(0);
}

test();

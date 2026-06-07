require('dotenv').config();
const pool = require('./src/config/database');

async function main() {
    console.log('--- Checking API getProducts logic ---');
    const result = await pool.query(`
      SELECT 
        mvc.ProductID, mvc.ProductCode, mvc.ProductName,
        COALESCE(inv.RealTotalQty, 0) as TotalQty,
        mvc.TotalQty as MvcTotalQty
      FROM mv_Catalogue mvc
      LEFT JOIN (
        SELECT ProductID, SUM(QuantityOnHand) as RealTotalQty
        FROM Inventory
        GROUP BY ProductID
      ) inv ON mvc.ProductID = inv.ProductID
      WHERE mvc.productcode_lower LIKE '%almeria gris%'
    `);
    console.log('Result from getProducts logic:', result.rows);

    console.log('--- Checking vw_CurrentInventory logic ---');
    const vwRes = await pool.query(`
      SELECT 
        InventoryID, ProductID, ProductCode, ProductName,
        QuantityOnHand, QuantityReserved, QuantityAvailable
      FROM vw_CurrentInventory
      WHERE ProductCode ILIKE '%almeria gris%'
    `);
    console.log('Result from vw_CurrentInventory:', vwRes.rows);

}
main().catch(console.error).finally(() => { pool.end(); process.exit(); });

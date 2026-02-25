const pool = require('../../../config/database');

/**
 * Get all warehouses
 */
async function getAllWarehouses(req, res, next) {
  try {
    // Simple query to get all active warehouses, can add search/filter later
    const query = `
      SELECT WarehouseID, WarehouseName, WarehouseCode 
      FROM Warehouses 
      WHERE IsActive = TRUE 
      ORDER BY WarehouseName
    `;
    const result = await pool.query(query);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllWarehouses,
};
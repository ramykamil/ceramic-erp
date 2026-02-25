// backend/src/api/v1/controllers/unit.controller.js
const pool = require('../../../config/database'); //

/**
 * Get all units
 */
async function getAllUnits(req, res, next) {
  try {
    // Select UnitID, UnitCode, and UnitName from Units table, order by name
    // Note: Units table doesn't have an IsActive column in the provided schema
    const query = 'SELECT UnitID, UnitCode, UnitName FROM Units ORDER BY UnitName';
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error); // Pass error to the global error handler
  }
}

module.exports = {
  getAllUnits,
};
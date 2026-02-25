// backend/src/api/v1/controllers/category.controller.js
const pool = require('../../../config/database'); //

/**
 * Get all active categories
 */
async function getAllCategories(req, res, next) {
  try {
    // Select CategoryID and CategoryName from Categories table where IsActive is true, order by name
    const query = 'SELECT CategoryID, CategoryName FROM Categories WHERE IsActive = TRUE ORDER BY CategoryName';
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error); // Pass error to the global error handler
  }
}

module.exports = {
  getAllCategories,
};
const pool = require('../../../config/database');

async function getAllFactories(req, res, next) {
  try {
    const result = await pool.query('SELECT FactoryID, FactoryName FROM Factories WHERE IsActive = TRUE ORDER BY FactoryName');
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

module.exports = { getAllFactories };
const pool = require('../../../config/database');

/**
 * Récupère toutes les listes de prix actives
 */
async function getAllPriceLists(req, res, next) {
  try {
    const query = `
        SELECT PriceListID, PriceListName, PriceListCode
        FROM PriceLists
        WHERE IsActive = TRUE
        ORDER BY PriceListName;
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllPriceLists,
};
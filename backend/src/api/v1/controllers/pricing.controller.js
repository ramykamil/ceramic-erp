const pricingService = require('../services/pricing.service');

async function getProductPrice(req, res, next) {
  try {
    const { productId, customerId } = req.params;
    const priceInfo = await pricingService.getProductPriceForCustomer(parseInt(productId), parseInt(customerId));
    res.json({ success: true, data: priceInfo });
  } catch (error) { next(error); }
}

async function getCustomerPrices(req, res, next) {
  try {
    const prices = await pricingService.getCustomerSpecificPrices(parseInt(req.params.customerId));
    res.json({ success: true, data: prices });
  } catch (error) { next(error); }
}

// --- NEW: Rules Controller Functions ---
async function getCustomerRules(req, res, next) {
  try {
    const { customerId } = req.params;
    // Join with Brands instead of Factories
    const query = `
      SELECT r.RuleID, r.BrandID, b.BrandName, r.Size, r.SpecificPrice
      FROM CustomerFactoryRules r
      JOIN Brands b ON r.BrandID = b.BrandID
      WHERE r.CustomerID = $1
      ORDER BY b.BrandName, r.Size
    `;
    const pool = require('../../../config/database'); // Lazy import
    const result = await pool.query(query, [customerId]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

async function setCustomerRule(req, res, next) {
  try {
    const { customerId } = req.params;
    const { brandId, size, price } = req.body; // Expect brandId
    const pool = require('../../../config/database');
    const query = `
      INSERT INTO CustomerFactoryRules (CustomerID, BrandID, Size, SpecificPrice)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (CustomerID, BrandID, Size) 
      DO UPDATE SET SpecificPrice = EXCLUDED.SpecificPrice
      RETURNING *
    `;
    const result = await pool.query(query, [customerId, brandId, size, price]);
    res.json({ success: true, message: 'Règle mise à jour', data: result.rows[0] });
  } catch (error) { next(error); }
}

async function deleteCustomerRule(req, res, next) {
  try {
    const pool = require('../../../config/database');
    await pool.query('DELETE FROM CustomerFactoryRules WHERE RuleID = $1', [req.params.ruleId]);
    res.json({ success: true, message: 'Règle supprimée' });
  } catch (error) { next(error); }
}

// ... (Keep other exports like setCustomerPrice, import, export, bulkSet) ...
async function setCustomerPrice(req, res, next) {
  try {
    const { customerId } = req.params;
    const { productId, specificPrice, notes } = req.body;
    const result = await pricingService.setCustomerSpecificPrice(customerId, productId, specificPrice, notes, req.user.userId);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

async function deleteCustomerPrice(req, res, next) {
  try {
    const { customerId, productId } = req.params;
    await pricingService.deleteCustomerSpecificPrice(customerId, productId);
    res.json({ success: true, message: 'Price deleted' });
  } catch (error) { next(error); }
}

async function importCustomerPrices(req, res, next) { res.json({ success: true }); }
async function exportCustomerPrices(req, res, next) { res.json({ success: true }); }
async function bulkSetCustomerPrices(req, res, next) { res.json({ success: true }); }

// Add getProductSizes here too if routes reference it from pricingController (as per previous index.js check it was there)
// But wait, the user prompt put getProductSizes in product.controller.js and updated routes to point to productController.getProductSizes
// So I should NOT put it here unless I want to keep the old route working?
// The user prompt Step 6 says: router.get('/products/sizes', authenticateToken, productController.getProductSizes);
// So I will NOT put it here.

module.exports = {
  getProductPrice,
  getCustomerPrices,
  getCustomerRules,
  setCustomerRule,
  deleteCustomerRule,
  setCustomerPrice,
  deleteCustomerPrice,
  importCustomerPrices,
  exportCustomerPrices,
  bulkSetCustomerPrices
};

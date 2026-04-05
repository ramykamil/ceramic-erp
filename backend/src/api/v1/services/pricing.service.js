const pool = require('../../../config/database');

async function getProductPriceForCustomer(productId, customerId) {
  const currentDate = new Date().toISOString().split('T')[0];

  // 1. LEVEL 1: Specific Contract
  const contractRes = await pool.query(`
    SELECT SpecificPrice FROM CustomerProductPrices
    WHERE CustomerID = $1 AND ProductID = $2
  `, [customerId, productId]);

  if (contractRes.rows.length > 0) {
    return { price: parseFloat(contractRes.rows[0].specificprice), source: 'CONTRACT' };
  }

  // 2. LEVEL 2: Brand/Size Rule (Refactored from Factory)
  const productInfo = await pool.query(
    "SELECT BrandID, Size FROM Products WHERE ProductID = $1",
    [productId]
  );

  if (productInfo.rows.length > 0) {
    const { brandid, size } = productInfo.rows[0];

    if (brandid && size) {
      const ruleCheck = await pool.query(`
          SELECT SpecificPrice, 'BRAND_RULE' as source
          FROM CustomerFactoryRules
          WHERE CustomerID = $1 AND BrandID = $2 AND Size = $3
        `, [customerId, brandid, size]);

      if (ruleCheck.rows.length > 0) {
        return {
          price: parseFloat(ruleCheck.rows[0].specificprice),
          source: 'BRAND_RULE'
        };
      }
    }
  }

  // 3. LEVEL 3: Price List
  const listRes = await pool.query(`
    SELECT pli.Price FROM PriceListItems pli
    JOIN Customers c ON c.PriceListID = pli.PriceListID
    WHERE c.CustomerID = $1 AND pli.ProductID = $2
  `, [customerId, productId]);
  if (listRes.rows.length > 0) {
    return { price: parseFloat(listRes.rows[0].price), source: 'PRICELIST' };
  }

  // 4. LEVEL 4: Base Price
  const baseRes = await pool.query('SELECT BasePrice FROM Products WHERE ProductID = $1', [productId]);
  if (baseRes.rows.length > 0) {
    return { price: parseFloat(baseRes.rows[0].baseprice), source: 'BASE' };
  }

  return { price: 0, source: 'NOT_FOUND', error: 'Price not found' };
}

async function getCustomerSpecificPrices(customerId) {
  const res = await pool.query(`
        SELECT cpp.SpecificPrice, p.ProductCode, p.ProductName, p.BasePrice 
        FROM CustomerProductPrices cpp
        JOIN Products p ON cpp.ProductID = p.ProductID
        WHERE cpp.CustomerID = $1
    `, [customerId]);
  return res.rows;
}

// Add setCustomerSpecificPrice and deleteCustomerSpecificPrice as they are referenced in controller
async function setCustomerSpecificPrice(customerId, productId, specificPrice, notes, userId) {
  const res = await pool.query(`
        INSERT INTO CustomerProductPrices (CustomerID, ProductID, SpecificPrice, Notes, CreatedBy)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (CustomerID, ProductID) DO UPDATE SET SpecificPrice = EXCLUDED.SpecificPrice, Notes = EXCLUDED.Notes
        RETURNING *
    `, [customerId, productId, specificPrice, notes, userId]);
  return res.rows[0];
}

async function deleteCustomerSpecificPrice(customerId, productId) {
  await pool.query('DELETE FROM CustomerProductPrices WHERE CustomerID = $1 AND ProductID = $2', [customerId, productId]);
}

module.exports = {
  getProductPriceForCustomer,
  getCustomerSpecificPrices,
  setCustomerSpecificPrice,
  deleteCustomerSpecificPrice
};

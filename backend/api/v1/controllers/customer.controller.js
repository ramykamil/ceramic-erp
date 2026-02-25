const pool = require('../../../config/database');
const auditService = require('../../../services/audit.service');

/**
 * Get all customers (actifs ET inactifs)
 * MODIFIÉ: Retrait du filtre 'WHERE c.IsActive = TRUE'
 */
async function getCustomers(req, res, next) {
  try {
    const { page = 1, limit = 50, customerType, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        c.*,
        pl.PriceListName,
        COALESCE(sales.TotalBought, 0) AS totalbought
      FROM Customers c
      LEFT JOIN PriceLists pl ON c.PriceListID = pl.PriceListID
      LEFT JOIN (
        SELECT
            CustomerID,
            SUM(TotalAmount) AS TotalBought
        FROM Orders
        WHERE Status IN ('DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED')
        GROUP BY CustomerID
      ) AS sales ON c.CustomerID = sales.CustomerID
      WHERE 1=1
      -- Le filtre 'IsActive = TRUE' a été retiré d'ici pour tout afficher
    `;

    const params = [];
    let paramIndex = 1;

    if (customerType) {
      query += ` AND c.CustomerType = $${paramIndex++}`;
      params.push(customerType);
    }

    if (search) {
      query += ` AND (c.CustomerName ILIKE $${paramIndex} OR c.CustomerCode ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY c.IsActive DESC, c.CustomerName LIMIT $${paramIndex++} OFFSET $${paramIndex++}`; // Trie les actifs en premier
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// ... (getCustomerById, createCustomer, updateCustomer restent inchangés) ...
async function getCustomerById(req, res, next) {
  try {
    const { id } = req.params;
    const query = `
      SELECT
        c.*,
        pl.PriceListName,
        pl.PriceListCode,
        COALESCE(sales.TotalBought, 0) AS totalbought
      FROM Customers c
      LEFT JOIN PriceLists pl ON c.PriceListID = pl.PriceListID
      LEFT JOIN (
        SELECT
            CustomerID,
            SUM(TotalAmount) AS TotalBought
        FROM Orders
        WHERE Status IN ('DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED')
        GROUP BY CustomerID
      ) AS sales ON c.CustomerID = sales.CustomerID
      WHERE c.CustomerID = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function createCustomer(req, res, next) {
  try {
    const {
      customerCode, customerName, customerType, priceListId,
      contactPerson, phone, email, address, taxId, paymentTerms,
      // New fields
      rc, ai, nif, nis, rib, ancienSolde
    } = req.body;

    // ancienSolde initializes CurrentBalance
    const initialBalance = parseFloat(ancienSolde) || 0;

    const query = `
      INSERT INTO Customers (
        CustomerCode, CustomerName, CustomerType, PriceListID,
        ContactPerson, Phone, Email, Address, TaxID,
        PaymentTerms, IsActive, CurrentBalance,
        RC, AI, NIF, NIS, RIB
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (CustomerCode) DO UPDATE
      SET
        CustomerName = EXCLUDED.CustomerName,
        CustomerType = EXCLUDED.CustomerType,
        PriceListId = EXCLUDED.PriceListId,
        Phone = EXCLUDED.Phone,
        Email = EXCLUDED.Email,
        Address = EXCLUDED.Address,
        PaymentTerms = EXCLUDED.PaymentTerms,
        IsActive = TRUE,
        CurrentBalance = COALESCE(EXCLUDED.CurrentBalance, Customers.CurrentBalance),
        RC = EXCLUDED.RC,
        AI = EXCLUDED.AI, 
        NIF = EXCLUDED.NIF,
        NIS = EXCLUDED.NIS,
        RIB = EXCLUDED.RIB,
        UpdatedAt = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [
      customerCode, customerName, customerType, priceListId,
      contactPerson, phone, email, address, taxId, paymentTerms,
      initialBalance, rc, ai, nif, nis, rib
    ]);

    await auditService.log(
      req.user ? req.user.userId : null,
      'CREATE_CUSTOMER',
      'Customers',
      result.rows[0].customerid,
      null,
      result.rows[0],
      req.ip,
      req.headers['user-agent']
    );

    res.status(201).json({
      success: true,
      message: 'Client créé ou réactivé avec succès',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}

async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const {
      customerName, customerType, priceListId, contactPerson,
      phone, email, address, taxId, paymentTerms, isActive
    } = req.body;
    const query = `
      UPDATE Customers
      SET
        CustomerName = COALESCE($1, CustomerName),
        CustomerType = COALESCE($2, CustomerType),
        PriceListID = COALESCE($3, PriceListID),
        ContactPerson = COALESCE($4, ContactPerson),
        Phone = COALESCE($5, Phone),
        Email = COALESCE($6, Email),
        Address = COALESCE($7, Address),
        TaxID = COALESCE($8, TaxID),
        PaymentTerms = COALESCE($9, PaymentTerms),
        IsActive = COALESCE($10, IsActive),
        CurrentBalance = COALESCE($12, CurrentBalance),
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE CustomerID = $11
      RETURNING *
    `;
    const result = await pool.query(query, [
      customerName, customerType, priceListId, contactPerson,
      phone, email, address, taxId, paymentTerms, isActive, id, req.body.currentBalance
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await auditService.log(
      req.user ? req.user.userId : null,
      'UPDATE_CUSTOMER',
      'Customers',
      id,
      null, // Ideally we would fetch old values before update for full diff
      result.rows[0],
      req.ip,
      req.headers['user-agent']
    );

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const balanceCheck = await pool.query('SELECT CurrentBalance FROM Customers WHERE CustomerID = $1', [id]);
    if (balanceCheck.rows.length > 0 && balanceCheck.rows[0].currentbalance > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de désactiver : le client a un solde impayé de ${balanceCheck.rows[0].currentbalance} DZD.`
      });
    }
    const orderCheck = await pool.query(
      "SELECT 1 FROM Orders WHERE CustomerID = $1 AND Status NOT IN ('DELIVERED', 'CANCELLED') LIMIT 1",
      [id]
    );
    if (orderCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Impossible de désactiver : le client a des commandes en cours."
      });
    }
    const query = `
      UPDATE Customers
      SET IsActive = FALSE, UpdatedAt = CURRENT_TIMESTAMP
      WHERE CustomerID = $1
      RETURNING CustomerID;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }
    res.json({ success: true, message: 'Client désactivé avec succès' });
  } catch (error) {
    next(error);
  }
}

/**
 * NOUVEAU: Supprime définitivement un client
 */
async function hardDeleteCustomer(req, res, next) {
  try {
    const { id } = req.params;

    // Étape 1 : Vérifier le statut et l'historique
    const checkQuery = `
      SELECT
        IsActive,
        (SELECT COUNT(*) FROM Orders WHERE CustomerID = $1) AS OrderCount
      FROM Customers
      WHERE CustomerID = $1;
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Client non trouvé.' });
    }

    const customer = checkResult.rows[0];

    // Sécurité 1 : Ne pas supprimer un client actif
    if (customer.isactive) {
      return res.status(400).json({ success: false, message: 'Impossible de supprimer un client actif. Veuillez d\'abord le désactiver.' });
    }

    // Sécurité 2 : Ne pas supprimer un client avec un historique de commandes
    // La suppression en cascade des commandes pourrait causer des problèmes de comptabilité
    if (customer.ordercount > 0) {
      return res.status(400).json({ success: false, message: 'Impossible de supprimer : ce client a un historique de commandes. La suppression est bloquée pour préserver l\'intégrité des données.' });
    }

    // Étape 2 : Procéder à la suppression définitive
    // Les prix spécifiques (CustomerProductPrices) seront supprimés en cascade grâce au 'ON DELETE CASCADE' du schéma
    const deleteQuery = 'DELETE FROM Customers WHERE CustomerID = $1 AND IsActive = FALSE;';
    const result = await pool.query(deleteQuery, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Client non trouvé ou déjà actif.' });
    }

    res.json({ success: true, message: 'Client supprimé définitivement avec succès.' });
  } catch (error) {
    // Gère les erreurs de contrainte (bien que nous ayons vérifié OrderCount, au cas où)
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ success: false, message: `Suppression échouée : Le client est toujours lié à d'autres enregistrements (ex: factures, interactions). ${error.detail}` });
    }
    next(error);
  }
}

/**
 * NEW: Get customer-specific price for a product
 * Priority: 1. Last Sale Price, 2. Custom Price, 3. Base Price
 */
async function getCustomerProductPrice(req, res, next) {
  try {
    const { customerId, productId } = req.params;

    // 1. Get Last Sale Price from order history
    const lastSaleQuery = `
      SELECT oi.UnitPrice, oi.Quantity, o.CreatedAt as SaleDate
      FROM OrderItems oi
      JOIN Orders o ON oi.OrderID = o.OrderID
      WHERE o.CustomerID = $1 
        AND oi.ProductID = $2 
        AND o.Status NOT IN ('CANCELLED', 'DRAFT')
      ORDER BY o.CreatedAt DESC
      LIMIT 1
    `;
    const lastSaleResult = await pool.query(lastSaleQuery, [customerId, productId]);
    const lastSalePrice = lastSaleResult.rows.length > 0 ? parseFloat(lastSaleResult.rows[0].unitprice) : null;
    const lastSaleDate = lastSaleResult.rows.length > 0 ? lastSaleResult.rows[0].saledate : null;
    const lastSaleQty = lastSaleResult.rows.length > 0 ? parseFloat(lastSaleResult.rows[0].quantity) : null;

    // 2. Get Custom Price (if manually set)
    const customPriceQuery = `
      SELECT SpecificPrice FROM CustomerProductPrices 
      WHERE CustomerID = $1 AND ProductID = $2
      AND (EffectiveTo IS NULL OR EffectiveTo >= CURRENT_DATE)
    `;
    const customPriceResult = await pool.query(customPriceQuery, [customerId, productId]);
    const customPrice = customPriceResult.rows.length > 0 ? parseFloat(customPriceResult.rows[0].specificprice) : null;

    // 3. Get Base Price
    const basePriceQuery = `SELECT BasePrice, ProductName FROM Products WHERE ProductID = $1`;
    const basePriceResult = await pool.query(basePriceQuery, [productId]);
    const basePrice = basePriceResult.rows.length > 0 ? parseFloat(basePriceResult.rows[0].baseprice) : 0;
    const productName = basePriceResult.rows.length > 0 ? basePriceResult.rows[0].productname : '';

    // Determine recommended price (priority: lastSale > custom > base)
    let recommendedPrice = basePrice;
    let priceSource = 'BASE';

    if (customPrice !== null) {
      recommendedPrice = customPrice;
      priceSource = 'CUSTOM';
    }

    if (lastSalePrice !== null) {
      recommendedPrice = lastSalePrice;
      priceSource = 'HISTORY';
    }

    res.json({
      success: true,
      data: {
        productId: parseInt(productId),
        productName,
        customerId: parseInt(customerId),
        lastSalePrice,
        lastSaleDate,
        lastSaleQty,
        customPrice,
        basePrice,
        recommendedPrice,
        priceSource // 'HISTORY', 'CUSTOM', or 'BASE'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get Customer Statistics (Total Receivables)
 */
async function getCustomerStats(req, res, next) {
  try {
    const query = `
            SELECT 
                SUM(CurrentBalance) as totalReceivables,
                COUNT(*) as totalCustomers
            FROM Customers
            WHERE IsActive = TRUE AND CurrentBalance > 0
        `;
    const result = await pool.query(query);
    res.json({
      success: true,
      data: {
        totalReceivables: parseFloat(result.rows[0].totalreceivables || 0),
        totalCustomers: parseInt(result.rows[0].totalcustomers || 0)
      }
    });
  } catch (error) {
    console.error('Error getting customer stats:', error);
    next(error);
  }
}

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  hardDeleteCustomer,
  getCustomerProductPrice,
  getCustomerStats
};


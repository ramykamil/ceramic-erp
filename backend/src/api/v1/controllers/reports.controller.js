const pool = require('../../../config/database');

// Helper to format money
const formatDZD = (amount) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 2 }).format(amount || 0);

/**
 * GET /reports/sales
 * Sales transactions with KPIs for date range
 */
const getSalesReport = async (req, res) => {
  const { startDate, endDate, salesPersonId } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    let userFilter = '';
    const queryParams = [start, end];
    if (salesPersonId) {
      userFilter = ` AND SalesPersonID = $3`;
      queryParams.push(salesPersonId);
    }

    // Get sales summary (using only Orders table)
    const summaryResult = await pool.query(`
            SELECT 
                COALESCE(SUM(TotalAmount), 0) as total_sales,
                0 as total_paid,
                COALESCE(SUM(TotalAmount), 0) as total_remaining,
                COUNT(*) as sale_count
            FROM Orders
            WHERE OrderDate BETWEEN $1 AND $2
            AND Status != 'CANCELLED'
            ${userFilter}
        `, queryParams);

    // Get yesterday's total
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const yesterdayParams = [yesterdayStr];
    let yesterdayUserFilter = '';
    if (salesPersonId) {
      yesterdayUserFilter = ` AND SalesPersonID = $2`;
      yesterdayParams.push(salesPersonId);
    }

    const yesterdayResult = await pool.query(`
            SELECT COALESCE(SUM(TotalAmount), 0) as yesterday_total
            FROM Orders
            WHERE OrderDate = $1 AND Status != 'CANCELLED'
            ${yesterdayUserFilter}
        `, yesterdayParams);

    // Get transactions list (simplified)
    const transactionsQuery = `
            SELECT 
                o.OrderID,
                o.OrderNumber as numero,
                c.CustomerName as client,
                o.OrderDate as date,
                TO_CHAR(o.CreatedAt, 'HH24:MI') as heure,
                COALESCE(o.DiscountAmount, 0) as remise,
                0 as benefice,
                COALESCE(o.TotalAmount, 0) as total,
                0 as versement,
                0 as rendu,
                COALESCE(o.TotalAmount, 0) as reste
            FROM Orders o
            LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
            WHERE o.OrderDate BETWEEN $1 AND $2
            AND o.Status != 'CANCELLED'
            ${salesPersonId ? ` AND o.SalesPersonID = $3` : ''}
            ORDER BY o.CreatedAt DESC
            LIMIT 100
        `;

    const transactionsResult = await pool.query(transactionsQuery, queryParams);

    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      data: {
        kpis: {
          totalHier: parseFloat(yesterdayResult.rows[0]?.yesterday_total || 0),
          total: parseFloat(summary.total_sales),
          versement: parseFloat(summary.total_paid),
          reste: parseFloat(summary.total_remaining),
          count: parseInt(summary.sale_count)
        },
        transactions: transactionsResult.rows
      }
    });
  } catch (error) {
    console.error('Error in getSalesReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  }
};

// ... (getDashboardSummary kept as is or updated similarly if needed) ...

/**
 * GET /reports/financials
 * Financial dashboard KPIs
 */
const getFinancialsReport = async (req, res) => {
  const { startDate, endDate, salesPersonId } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    let orderFilter = '';
    const queryParams = [start, end];
    if (salesPersonId) {
      orderFilter = ` AND SalesPersonID = $3`;
      queryParams.push(salesPersonId);
    }

    // Chiffre d'affaires (Revenue)
    // Exclude DeliveryCost from revenue - transport fees go to drivers, not business profit
    const revenueResult = await pool.query(`
            SELECT COALESCE(SUM(TotalAmount - COALESCE(DeliveryCost, 0)), 0) as revenue
            FROM Orders
            WHERE OrderDate BETWEEN $1 AND $2 AND Status != 'CANCELLED'
            ${orderFilter}
        `, queryParams);

    // Client Credit (Outstanding customer balances) - Not easily filterable by sales person without more complex Logic
    // For now we keep it global or we could join with customers associated with salesperson
    const clientCreditResult = await pool.query(`
            SELECT COALESCE(SUM(CurrentBalance), 0) as client_credit
            FROM Customers
            WHERE CurrentBalance > 0
        `);

    // Supplier Credit - Not related to sales person usually
    const supplierCreditResult = await pool.query(`
            SELECT COALESCE(SUM(TotalAmount), 0) as supplier_credit
            FROM PurchaseOrders
            WHERE Status NOT IN ('CANCELLED', 'PAID')
        `);

    // Calculate profit (simplified: revenue - purchase costs in the period)
    // Purchase costs are global usually. Filtering profit by salesperson is tricky without per-item cost analysis.
    // For now, if salesPersonId is present, we might only show Revenue. Or we try to estimate cost of goods sold.
    // Let's just filter revenue for now.

    // Cost of goods sold (COGS) for the specific orders of this salesperson
    // This is better than total PurchaseOrders. 
    // But current implementation uses PurchaseOrders for "purchase_cost". This is actually "Expenses", not COGS.

    const purchaseCostResult = await pool.query(`
            SELECT COALESCE(SUM(TotalAmount), 0) as purchase_cost
            FROM PurchaseOrders
            WHERE OrderDate BETWEEN $1 AND $2 AND Status != 'CANCELLED'
            ${salesPersonId ? ' AND 1=0' : ''} -- If filtering by salesperson, don't show global purchase costs
        `, [start, end]);

    const revenue = parseFloat(revenueResult.rows[0]?.revenue || 0);
    const purchaseCost = parseFloat(purchaseCostResult.rows[0]?.purchase_cost || 0);
    const beneficeNet = revenue - purchaseCost;

    res.json({
      success: true,
      data: {
        chiffreAffaires: revenue,
        beneficeNet: beneficeNet > 0 ? beneficeNet : 0,
        beneficeTotal: beneficeNet > 0 ? beneficeNet : 0,
        creditClient: parseFloat(clientCreditResult.rows[0]?.client_credit || 0),
        creditFournisseurs: parseFloat(supplierCreditResult.rows[0]?.supplier_credit || 0),
        charges: 0,
        capital: revenue - purchaseCost
      }
    });
  } catch (error) {
    console.error('Error in getFinancialsReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/top-products
 * Best-selling products
 */
const getTopProductsReport = async (req, res) => {
  const { startDate, endDate, salesPersonId } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const queryParams = [start, end];
    let userFilter = '';
    if (salesPersonId) {
      userFilter = ` AND o.SalesPersonID = $3`;
      queryParams.push(salesPersonId);
    }

    const result = await pool.query(`
            SELECT 
                p.ProductID,
                p.ProductCode as reference,
                p.ProductName as designation,
                b.BrandName as brand,
                COALESCE(SUM(oi.Quantity), 0) as qty_total,
                COALESCE(SUM(oi.LineTotal), 0) as total,
                COUNT(DISTINCT o.OrderID) as vente_count
            FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            LEFT JOIN OrderItems oi ON p.ProductID = oi.ProductID
            LEFT JOIN Orders o ON oi.OrderID = o.OrderID
            WHERE (o.OrderDate BETWEEN $1 AND $2)
            AND (o.Status != 'CANCELLED')
            ${userFilter}
            GROUP BY p.ProductID, p.ProductCode, p.ProductName, b.BrandName
            HAVING COALESCE(SUM(oi.Quantity), 0) > 0
            ORDER BY total DESC
            LIMIT 50
        `, queryParams);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in getTopProductsReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ... (getTopBrandsReport similar update) ...

/**
 * GET /reports/top-brands
 * Best-selling brands
 */
const getTopBrandsReport = async (req, res) => {
  const { startDate, endDate, salesPersonId } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const queryParams = [start, end];
    let userFilter = '';
    if (salesPersonId) {
      userFilter = ` AND o.SalesPersonID = $3`;
      queryParams.push(salesPersonId);
    }

    const result = await pool.query(`
            SELECT 
                b.BrandID,
                b.BrandName as brand,
                COUNT(DISTINCT p.ProductID) as nb_produits,
                COALESCE(SUM(oi.Quantity), 0) as qty_total,
                COALESCE(SUM(oi.LineTotal), 0) as total,
                COUNT(DISTINCT o.OrderID) as vente_count
            FROM Brands b
            LEFT JOIN Products p ON b.BrandID = p.BrandID
            LEFT JOIN OrderItems oi ON p.ProductID = oi.ProductID
            LEFT JOIN Orders o ON oi.OrderID = o.OrderID
            WHERE (o.OrderDate BETWEEN $1 AND $2)
            AND (o.Status != 'CANCELLED')
            ${userFilter}
            GROUP BY b.BrandID, b.BrandName
            HAVING COALESCE(SUM(oi.Quantity), 0) > 0
            ORDER BY total DESC
            LIMIT 50
        `, queryParams);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in getTopBrandsReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/purchases
 * Purchase transactions with KPIs for date range
 */
const getPurchasesReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    // Get purchase summary
    const summaryResult = await pool.query(`
            SELECT 
                COALESCE(SUM(TotalAmount), 0) as total_purchases,
                0 as total_paid,
                COALESCE(SUM(TotalAmount), 0) as total_remaining,
                COUNT(*) as purchase_count
            FROM PurchaseOrders
            WHERE OrderDate BETWEEN $1 AND $2
            AND Status != 'CANCELLED'
        `, [start, end]);

    // Get yesterday's total
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const yesterdayResult = await pool.query(`
            SELECT COALESCE(SUM(TotalAmount), 0) as yesterday_total
            FROM PurchaseOrders
            WHERE OrderDate = $1 AND Status != 'CANCELLED'
        `, [yesterdayStr]);

    // Get transactions list
    const transactionsResult = await pool.query(`
            SELECT 
                po.PurchaseOrderID,
                po.PONumber as numero,
                f.FactoryName as fournisseur,
                po.OrderDate as date,
                TO_CHAR(po.CreatedAt, 'HH24:MI') as heure,
                0 as remise,
                0 as benefice,
                po.TotalAmount as total,
                0 as versement,
                po.TotalAmount as reste
            FROM PurchaseOrders po
            LEFT JOIN Factories f ON po.FactoryID = f.FactoryID
            WHERE po.OrderDate BETWEEN $1 AND $2
            AND po.Status != 'CANCELLED'
            ORDER BY po.CreatedAt DESC
            LIMIT 100
        `, [start, end]);

    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      data: {
        kpis: {
          totalHier: parseFloat(yesterdayResult.rows[0]?.yesterday_total || 0),
          total: parseFloat(summary.total_purchases),
          paiement: parseFloat(summary.total_paid),
          reste: parseFloat(summary.total_remaining),
          count: parseInt(summary.purchase_count)
        },
        transactions: transactionsResult.rows
      }
    });
  } catch (error) {
    console.error('Error in getPurchasesReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/financials
 * Financial dashboard KPIs
 */


/**
 * GET /reports/products-detail
 * Product-level sales with profit
 */
const getProductsDetailReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(`
            SELECT 
                o.OrderNumber as n_vente,
                p.ProductCode as reference,
                p.ProductName as designation,
                oi.Quantity as qty,
                COALESCE(oi.PalletCount, 0) as colis,
                COALESCE(oi.ColisCount, 0) as palette,
                COALESCE(p.BasePrice * 0.7, 0) as prix_achat,
                oi.UnitPrice as prix_vente,
                oi.LineTotal as total,
                COALESCE(oi.LineTotal - (p.BasePrice * 0.7 * oi.Quantity), 0) as benefice
            FROM OrderItems oi
            JOIN Orders o ON oi.OrderID = o.OrderID
            JOIN Products p ON oi.ProductID = p.ProductID
            WHERE o.OrderDate BETWEEN $1 AND $2
            AND o.Status != 'CANCELLED'
            ORDER BY o.CreatedAt DESC
            LIMIT 100
        `, [start, end]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in getProductsDetailReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/clients
 * Client transaction summary
 */
const getClientsReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(`
            SELECT 
                c.CustomerID,
                c.CustomerName as nom,
                c.CustomerType as type,
                COUNT(o.OrderID) as nb_commandes,
                MAX(o.OrderDate) as derniere_date,
                COALESCE(SUM(o.DiscountAmount), 0) as remise,
                0 as benefice,
                COALESCE(SUM(o.TotalAmount), 0) as total,
                COALESCE(SUM(i.PaidAmount), 0) as versement,
                0 as rendu,
                COALESCE(SUM(o.TotalAmount) - SUM(COALESCE(i.PaidAmount, 0)), 0) as reste
            FROM Customers c
            LEFT JOIN Orders o ON c.CustomerID = o.CustomerID 
                AND o.OrderDate BETWEEN $1 AND $2
                AND o.Status != 'CANCELLED'
            LEFT JOIN Invoices i ON o.OrderID = i.OrderID
            GROUP BY c.CustomerID, c.CustomerName, c.CustomerType
            HAVING COUNT(o.OrderID) > 0
            ORDER BY total DESC
            LIMIT 100
        `, [start, end]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in getClientsReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/dashboard-summary (Legacy)
 * Dashboard KPIs with balance cards
 */
const getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    // Monthly sales - Exclude DeliveryCost (transport fees go to drivers, not business)
    const salesResult = await pool.query(`
            SELECT COALESCE(SUM(TotalAmount - COALESCE(DeliveryCost, 0)), 0) as total
            FROM Orders
            WHERE OrderDate >= $1 AND Status != 'CANCELLED'
        `, [firstOfMonth]);

    // Pending orders
    const pendingResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM Orders
            WHERE Status IN ('PENDING', 'PROCESSING')
        `);

    // Low stock - count items with stock <= 10 or out of stock
    const lowStockResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM Inventory
            WHERE QuantityOnHand <= 10
        `);

    // New customers this month
    const newCustomersResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM Customers
            WHERE CreatedAt >= $1
        `, [firstOfMonth]);

    // Client Balance (Reste Clients) - Total owed BY customers
    // Include BOTH POS payments (Orders.PaymentAmount) AND CashTransaction payments
    // Exclude DeliveryCost (transport fees go to drivers, not business)
    const clientBalanceResult = await pool.query(`
        WITH CustomerOrders AS (
            SELECT 
                c.CustomerName,
                COALESCE(SUM(o.TotalAmount - COALESCE(o.DeliveryCost, 0)), 0) as total_orders,
                COALESCE(SUM(o.PaymentAmount - COALESCE(o.DeliveryCost, 0)), 0) as pos_payments
            FROM Customers c
            LEFT JOIN Orders o ON c.CustomerID = o.CustomerID
                AND o.Status NOT IN ('CANCELLED', 'DRAFT')
            WHERE c.IsActive = TRUE
            GROUP BY c.CustomerName
        ),
        CustomerPayments AS (
            SELECT 
                ct.Tiers as customername,
                COALESCE(SUM(ct.Amount), 0) as total_paid
            FROM CashTransactions ct
            WHERE ct.TransactionType IN ('VERSEMENT', 'ENCAISSEMENT')
            GROUP BY ct.Tiers
        )
        SELECT COALESCE(SUM(co.total_orders - co.pos_payments - COALESCE(cp.total_paid, 0)), 0) as client_balance
        FROM CustomerOrders co
        LEFT JOIN CustomerPayments cp ON LOWER(co.CustomerName) = LOWER(cp.customername)
        WHERE co.total_orders > 0
    `);

    // Supplier Balance (Reste Fournisseurs) - Total owed TO suppliers
    // = Sum of all purchase orders - Sum of all payments made (ACHAT/PAIEMENT)
    // Match by factory name (Tiers field)
    const supplierBalanceResult = await pool.query(`
      WITH SupplierList AS (
          SELECT FactoryID as SupplierID, 'FACTORY' as SupplierType, InitialBalance FROM Factories WHERE IsActive = TRUE
          UNION ALL
          SELECT BrandID as SupplierID, 'BRAND' as SupplierType, InitialBalance FROM Brands WHERE IsActive = TRUE
      ),
      OrderTotals AS (
          SELECT 
              CASE WHEN BrandID IS NOT NULL THEN BrandID ELSE FactoryID END as SupplierID,
              CASE WHEN BrandID IS NOT NULL THEN 'BRAND' ELSE 'FACTORY' END as SupplierType,
              SUM(TotalAmount) as TotalBought
          FROM PurchaseOrders
          WHERE Status != 'CANCELLED'
          GROUP BY CASE WHEN BrandID IS NOT NULL THEN BrandID ELSE FactoryID END,
                   CASE WHEN BrandID IS NOT NULL THEN 'BRAND' ELSE 'FACTORY' END
      ),
      DirectPayments AS (
          SELECT ReferenceID, ReferenceType, SUM(Amount) as Amount
          FROM CashTransactions
          WHERE TransactionType IN ('ACHAT', 'PAIEMENT') AND ReferenceType IN ('BRAND', 'FACTORY')
          GROUP BY ReferenceID, ReferenceType
      ),
      POPayments AS (
          SELECT 
             po.FactoryID, po.BrandID, SUM(ct.Amount) as Amount
          FROM CashTransactions ct
          JOIN PurchaseOrders po ON ct.ReferenceID = po.PurchaseOrderID
          WHERE ct.TransactionType IN ('ACHAT', 'PAIEMENT') AND ct.ReferenceType = 'PURCHASE'
          GROUP BY po.FactoryID, po.BrandID
      )
      SELECT SUM(
          COALESCE(s.InitialBalance, 0) + 
          COALESCE(ot.TotalBought, 0) - 
          (
              COALESCE(dp.Amount, 0) + 
              COALESCE(CASE WHEN s.SupplierType='FACTORY' THEN pp.Amount ELSE NULL END, 0) +
              COALESCE(CASE WHEN s.SupplierType='BRAND' THEN pp2.Amount ELSE NULL END, 0)
          )
      ) as supplier_balance
      FROM SupplierList s
      LEFT JOIN OrderTotals ot ON s.SupplierID = ot.SupplierID AND s.SupplierType = ot.SupplierType
      LEFT JOIN DirectPayments dp ON s.SupplierID = dp.ReferenceID AND s.SupplierType = dp.ReferenceType
      LEFT JOIN POPayments pp ON s.SupplierID = pp.FactoryID AND s.SupplierType = 'FACTORY'
      LEFT JOIN POPayments pp2 ON s.SupplierID = pp2.BrandID AND s.SupplierType = 'BRAND'
    `);

    res.json({
      success: true,
      data: {
        monthlySales: parseFloat(salesResult.rows[0]?.total || 0),
        pendingOrders: parseInt(pendingResult.rows[0]?.count || 0),
        lowStockItems: parseInt(lowStockResult.rows[0]?.count || 0),
        newCustomers: parseInt(newCustomersResult.rows[0]?.count || 0),
        clientBalance: parseFloat(clientBalanceResult.rows[0]?.client_balance || 0),
        supplierBalance: parseFloat(supplierBalanceResult.rows[0]?.supplier_balance || 0)
      }
    });
  } catch (error) {
    console.error('Error in getDashboardSummary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/clients-balance
 * Detailed breakdown of client balances (who owes what)
 * VENTE = sale amount, VERSEMENT/ENCAISSEMENT = payments received from customer
 */
const getClientsBalance = async (req, res) => {
  try {
    // Include BOTH POS payments (Orders.PaymentAmount) AND CashTransaction payments
    // Exclude DeliveryCost from client balance - transport fees go to drivers, not business
    const result = await pool.query(`
      WITH CustomerOrders AS (
        SELECT 
          c.CustomerID,
          c.CustomerName,
          c.CustomerCode,
          c.CustomerType,
          c.Phone,
          COALESCE(SUM(o.TotalAmount - COALESCE(o.DeliveryCost, 0)), 0) as total_orders,
          COALESCE(SUM(o.PaymentAmount - COALESCE(o.DeliveryCost, 0)), 0) as pos_payments
        FROM Customers c
        LEFT JOIN Orders o ON c.CustomerID = o.CustomerID
          AND o.Status NOT IN ('CANCELLED', 'DRAFT')
        WHERE c.IsActive = TRUE
        GROUP BY c.CustomerID, c.CustomerName, c.CustomerCode, c.CustomerType, c.Phone
      ),
      CustomerPayments AS (
        SELECT 
          ct.Tiers as customername,
          COALESCE(SUM(ct.Amount), 0) as total_paid
        FROM CashTransactions ct
        WHERE ct.TransactionType IN ('VERSEMENT', 'ENCAISSEMENT')
        GROUP BY ct.Tiers
      )
      SELECT 
        co.CustomerID as customerid,
        co.CustomerName as customername,
        co.CustomerCode as customercode,
        co.CustomerType as customertype,
        co.Phone as phone,
        co.total_orders as totalbought,
        (co.pos_payments + COALESCE(cp.total_paid, 0)) as totalpaid,
        (co.total_orders - co.pos_payments - COALESCE(cp.total_paid, 0)) as balance
      FROM CustomerOrders co
      LEFT JOIN CustomerPayments cp ON LOWER(co.CustomerName) = LOWER(cp.customername)
      WHERE co.total_orders > 0
      ORDER BY (co.total_orders - co.pos_payments - COALESCE(cp.total_paid, 0)) DESC
      LIMIT 100
    `);


    // Calculate grand totals
    const totals = result.rows.reduce((acc, row) => ({
      totalBought: acc.totalBought + parseFloat(row.totalbought || 0),
      totalPaid: acc.totalPaid + parseFloat(row.totalpaid || 0),
      totalBalance: acc.totalBalance + parseFloat(row.balance || 0)
    }), { totalBought: 0, totalPaid: 0, totalBalance: 0 });

    res.json({
      success: true,
      data: result.rows,
      totals: totals
    });
  } catch (error) {
    console.error('Error in getClientsBalance:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/suppliers-balance
 * Detailed breakdown of supplier balances (what we owe)
 * ACHAT = purchase recorded, PAIEMENT = payment made to supplier
 */
const getSuppliersBalance = async (req, res) => {
  try {
    const result = await pool.query(`
      WITH SupplierList AS (
          SELECT FactoryID as SupplierID, 'FACTORY' as SupplierType, FactoryName as Name, ContactPerson, Phone, InitialBalance FROM Factories WHERE IsActive = TRUE
          UNION ALL
          SELECT BrandID as SupplierID, 'BRAND' as SupplierType, BrandName as Name, NULL as ContactPerson, NULL as Phone, InitialBalance FROM Brands WHERE IsActive = TRUE
      ),
      OrderTotals AS (
          SELECT 
              CASE WHEN BrandID IS NOT NULL THEN BrandID ELSE FactoryID END as SupplierID,
              CASE WHEN BrandID IS NOT NULL THEN 'BRAND' ELSE 'FACTORY' END as SupplierType,
              SUM(TotalAmount) as TotalBought
          FROM PurchaseOrders
          WHERE Status != 'CANCELLED'
          GROUP BY CASE WHEN BrandID IS NOT NULL THEN BrandID ELSE FactoryID END,
                   CASE WHEN BrandID IS NOT NULL THEN 'BRAND' ELSE 'FACTORY' END
      ),
      DirectPayments AS (
          SELECT ReferenceID, ReferenceType, SUM(Amount) as Amount
          FROM CashTransactions
          WHERE TransactionType IN ('ACHAT', 'PAIEMENT') AND ReferenceType IN ('BRAND', 'FACTORY')
          GROUP BY ReferenceID, ReferenceType
      ),
      POPayments AS (
          SELECT 
             po.FactoryID, po.BrandID, SUM(ct.Amount) as Amount
          FROM CashTransactions ct
          JOIN PurchaseOrders po ON ct.ReferenceID = po.PurchaseOrderID
          WHERE ct.TransactionType IN ('ACHAT', 'PAIEMENT') AND ct.ReferenceType = 'PURCHASE'
          GROUP BY po.FactoryID, po.BrandID
      )
      SELECT 
          s.SupplierID as factoryid,
          s.Name as factoryname,
          s.ContactPerson as contactperson,
          s.Phone as phone,
          COALESCE(ot.TotalBought, 0) as totalbought,
          (
            COALESCE(dp.Amount, 0) + 
            COALESCE(CASE WHEN s.SupplierType='FACTORY' THEN pp.Amount ELSE NULL END, 0) +
            COALESCE(CASE WHEN s.SupplierType='BRAND' THEN pp2.Amount ELSE NULL END, 0)
          ) as totalpaid,
          COALESCE(s.InitialBalance, 0) as initialBalance,
          (
            COALESCE(s.InitialBalance, 0) + 
            COALESCE(ot.TotalBought, 0) - 
            (
                COALESCE(dp.Amount, 0) + 
                COALESCE(CASE WHEN s.SupplierType='FACTORY' THEN pp.Amount ELSE NULL END, 0) +
                COALESCE(CASE WHEN s.SupplierType='BRAND' THEN pp2.Amount ELSE NULL END, 0)
            )
          ) as balance
      FROM SupplierList s
      LEFT JOIN OrderTotals ot ON s.SupplierID = ot.SupplierID AND s.SupplierType = ot.SupplierType
      LEFT JOIN DirectPayments dp ON s.SupplierID = dp.ReferenceID AND s.SupplierType = dp.ReferenceType
      LEFT JOIN POPayments pp ON s.SupplierID = pp.FactoryID AND s.SupplierType = 'FACTORY'
      LEFT JOIN POPayments pp2 ON s.SupplierID = pp2.BrandID AND s.SupplierType = 'BRAND'
      WHERE 
        (
            COALESCE(s.InitialBalance, 0) + 
            COALESCE(ot.TotalBought, 0) - 
            (
                COALESCE(dp.Amount, 0) + 
                COALESCE(CASE WHEN s.SupplierType='FACTORY' THEN pp.Amount ELSE NULL END, 0) +
                COALESCE(CASE WHEN s.SupplierType='BRAND' THEN pp2.Amount ELSE NULL END, 0)
            )
        ) > 0.01
      ORDER BY balance DESC
      LIMIT 100
    `);

    // Calculate grand totals
    const totals = result.rows.reduce((acc, row) => ({
      totalBought: acc.totalBought + parseFloat(row.totalbought || 0),
      totalPaid: acc.totalPaid + parseFloat(row.totalpaid || 0),
      totalBalance: acc.totalBalance + parseFloat(row.balance || 0)
    }), { totalBought: 0, totalPaid: 0, totalBalance: 0 });

    res.json({
      success: true,
      data: result.rows,
      totals: totals
    });
  } catch (error) {
    console.error('Error in getSuppliersBalance:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/employee-stats/:employeeId (Legacy)
 */
const getEmployeeStats = async (req, res) => {
  const { employeeId } = req.params;
  const { startDate, endDate } = req.query;
  try {
    const result = await pool.query(`
            SELECT 
                COUNT(*) as total_days,
                SUM(CASE WHEN Status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN Status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN Status = 'LATE' THEN 1 ELSE 0 END) as late_days
            FROM Attendance
            WHERE EmployeeID = $1
            ${startDate ? 'AND AttendanceDate >= $2' : ''}
            ${endDate ? `AND AttendanceDate <= $${startDate ? 3 : 2}` : ''}
        `, startDate && endDate ? [employeeId, startDate, endDate] :
      startDate ? [employeeId, startDate] :
        endDate ? [employeeId, endDate] : [employeeId]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error in getEmployeeStats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/sessions (Legacy)
 */
const getSessionHistory = async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT u.UserID, u.Username, u.LastLogin, u.Role
            FROM Users u
            WHERE u.LastLogin IS NOT NULL
            ORDER BY u.LastLogin DESC
            LIMIT 50
        `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error in getSessionHistory:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /reports/top-brands
 * Best-selling brands
 */

/**
 * GET /reports/payments
 * Payment list with totals
 */
const getPaymentsReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const paymentsResult = await pool.query(`
            SELECT 
                p.PaymentID,
                COALESCE(c.CustomerName, f.FactoryName, 'N/A') as tiers,
                p.PaymentDate as date,
                p.PaymentType as type,
                p.Amount as montant,
                p.PaymentMethod as mode_reglement,
                TRUE as paye,
                p.PaymentDate as echeance,
                'Admin' as ajoute_par
            FROM Payments p
            LEFT JOIN Customers c ON p.CustomerID = c.CustomerID
            LEFT JOIN Factories f ON p.FactoryID = f.FactoryID
            WHERE p.PaymentDate BETWEEN $1 AND $2
            ORDER BY p.PaymentDate DESC
            LIMIT 100
        `, [start, end]);

    const totalResult = await pool.query(`
            SELECT COALESCE(SUM(Amount), 0) as total
            FROM Payments
            WHERE PaymentDate BETWEEN $1 AND $2
        `, [start, end]);

    res.json({
      success: true,
      data: {
        payments: paymentsResult.rows,
        total: parseFloat(totalResult.rows[0]?.total || 0)
      }
    });
  } catch (error) {
    console.error('Error in getPaymentsReport:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getSalesReport,
  getPurchasesReport,
  getFinancialsReport,
  getPaymentsReport,
  getTopProductsReport,
  getProductsDetailReport,
  getClientsReport,
  getDashboardSummary,
  getEmployeeStats,
  getSessionHistory,
  getTopBrandsReport,
  getClientsBalance,
  getSuppliersBalance
};

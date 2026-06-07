const pool = require('../../../config/database');

class BiService {
  /**
   * Predict future demand based on recent sales velocity
   */
  static async getDemandForecast(productId, daysBack = 30) {
    const days = parseInt(daysBack) || 30;
    
    // 1. Calculate total sold quantity for the product
    const salesQuery = `
      SELECT COALESCE(SUM(oi.Quantity), 0) as total_sold
      FROM OrderItems oi
      JOIN Orders o ON oi.OrderID = o.OrderID
      WHERE oi.ProductID = $1
        AND o.OrderDate >= CURRENT_DATE - CAST($2 || ' days' AS INTERVAL)
        AND o.Status != 'CANCELLED';
    `;
    const salesRes = await pool.query(salesQuery, [productId, days]);
    const totalSold = parseFloat(salesRes.rows[0].total_sold);
    const dailyAvg = totalSold / days;

    // 2. Fetch current stock level across all warehouses
    const stockQuery = `
      SELECT COALESCE(SUM(QuantityOnHand), 0) as current_stock
      FROM Inventory
      WHERE ProductID = $1;
    `;
    const stockRes = await pool.query(stockQuery, [productId]);
    const currentStock = parseFloat(stockRes.rows[0].current_stock);

    // 3. Compute days until stockout
    const daysUntilStockout = dailyAvg > 0 ? Math.floor(currentStock / dailyAvg) : 999;

    // 4. Fetch product info
    const productQuery = `
      SELECT ProductID, ProductName, ProductCode, Size
      FROM Products
      WHERE ProductID = $1;
    `;
    const productRes = await pool.query(productQuery, [productId]);
    const product = productRes.rows[0];

    return {
      productId: parseInt(productId),
      productName: product ? product.productname : 'Unknown',
      productCode: product ? product.productcode : '',
      size: product ? product.size : '',
      periodDays: days,
      totalSold,
      dailyAverage: parseFloat(dailyAvg.toFixed(4)),
      weeklyForecast: parseFloat((dailyAvg * 7).toFixed(4)),
      monthlyForecast: parseFloat((dailyAvg * 30).toFixed(4)),
      currentStock,
      daysUntilStockout,
      reorderUrgent: daysUntilStockout <= 7
    };
  }

  /**
   * Predict which products will run out within X days
   */
  static async getLowStockPredictions(daysAhead = 7, daysBack = 30) {
    const forecastDays = parseInt(daysAhead) || 7;
    const historyDays = parseInt(daysBack) || 30;

    // Get all products sold in the history window with their total sold
    const salesQuery = `
      SELECT oi.ProductID as productid, p.ProductName as productname, p.ProductCode as productcode,
             SUM(oi.Quantity) as total_sold_30d
      FROM OrderItems oi
      JOIN Orders o ON oi.OrderID = o.OrderID
      JOIN Products p ON oi.ProductID = p.ProductID
      WHERE o.OrderDate >= CURRENT_DATE - CAST($1 || ' days' AS INTERVAL)
        AND o.Status != 'CANCELLED'
      GROUP BY oi.ProductID, p.ProductName, p.ProductCode;
    `;
    const salesRes = await pool.query(salesQuery, [historyDays]);

    const atRisk = [];
    for (const row of salesRes.rows) {
      const dailyAvg = parseFloat(row.total_sold_30d) / historyDays;
      const projectedDemand = dailyAvg * forecastDays;

      // Get current stock
      const stockRes = await pool.query(
        'SELECT COALESCE(SUM(QuantityOnHand), 0) as qty FROM Inventory WHERE ProductID = $1',
        [row.productid]
      );
      const currentStock = parseFloat(stockRes.rows[0].qty);

      if (currentStock <= projectedDemand) {
        atRisk.push({
          productId: row.productid,
          productName: row.productname,
          productCode: row.productcode,
          currentStock,
          projectedDemand: parseFloat(projectedDemand.toFixed(2)),
          dailyAverage: parseFloat(dailyAvg.toFixed(4)),
          daysLeft: dailyAvg > 0 ? Math.floor(currentStock / dailyAvg) : 999
        });
      }
    }

    atRisk.sort((a, b) => a.daysLeft - b.daysLeft);
    return {
      forecastDays,
      atRiskCount: atRisk.length,
      products: atRisk
    };
  }

  /**
   * Identify trending products based on sales acceleration
   */
  static async getTrendingProducts(daysBack = 30) {
    const days = parseInt(daysBack) || 30;

    // Recent sales
    const recentQuery = `
      SELECT oi.ProductID as productid, p.ProductName as productname, p.ProductCode as productcode,
             SUM(oi.Quantity) as recent_qty, SUM(oi.LineTotal) as recent_revenue
      FROM OrderItems oi
      JOIN Orders o ON oi.OrderID = o.OrderID
      JOIN Products p ON oi.ProductID = p.ProductID
      WHERE o.OrderDate >= CURRENT_DATE - CAST($1 || ' days' AS INTERVAL)
        AND o.Status != 'CANCELLED'
      GROUP BY oi.ProductID, p.ProductName, p.ProductCode;
    `;
    const recentRes = await pool.query(recentQuery, [days]);

    // Previous sales
    const prevQuery = `
      SELECT oi.ProductID as productid, SUM(oi.Quantity) as prev_qty
      FROM OrderItems oi
      JOIN Orders o ON oi.OrderID = o.OrderID
      WHERE o.OrderDate >= CURRENT_DATE - CAST(($1 * 2) || ' days' AS INTERVAL)
        AND o.OrderDate < CURRENT_DATE - CAST($1 || ' days' AS INTERVAL)
        AND o.Status != 'CANCELLED'
      GROUP BY oi.ProductID;
    `;
    const prevRes = await pool.query(prevQuery, [days]);

    const prevMap = {};
    for (const r of prevRes.rows) {
      prevMap[r.productid] = parseFloat(r.prev_qty);
    }

    const trending = [];
    for (const r of recentRes.rows) {
      const prevQty = prevMap[r.productid] || 0;
      const recentQty = parseFloat(r.recent_qty);
      const growth = prevQty > 0 ? ((recentQty - prevQty) / prevQty) * 100 : 100.0;

      trending.push({
        productId: r.productid,
        productName: r.productname,
        productCode: r.productcode,
        recentQuantity: recentQty,
        previousQuantity: prevQty,
        growthPercent: parseFloat(growth.toFixed(1)),
        recentRevenue: parseFloat(r.recent_revenue)
      });
    }

    trending.sort((a, b) => b.growthPercent - a.growthPercent);

    return {
      periodDays: days,
      trendingUp: trending.filter(t => t.growthPercent > 0).slice(0, 10),
      trendingDown: trending.filter(t => t.growthPercent < 0).slice(0, 10)
    };
  }

  /**
   * Analyze margins and profit trends
   */
  static async getProfitMarginAnalysis(startDate, endDate) {
    const start = startDate || '2000-01-01';
    const end = endDate || '2099-12-31';

    // Revenue
    const revRes = await pool.query(
      `SELECT COALESCE(SUM(TotalAmount - COALESCE(DeliveryCost, 0)), 0) as revenue
       FROM Orders
       WHERE OrderDate BETWEEN $1 AND $2 AND Status != 'CANCELLED';`,
      [start, end]
    );
    const revenue = parseFloat(revRes.rows[0].revenue);

    // Estimate COGS using base product purchase prices
    const cogsRes = await pool.query(
      `SELECT COALESCE(SUM(oi.Quantity * COALESCE(p.PurchasePrice, p.BasePrice * 0.7)), 0) as cogs
       FROM OrderItems oi
       JOIN Orders o ON oi.OrderID = o.OrderID
       JOIN Products p ON oi.ProductID = p.ProductID
       WHERE o.OrderDate BETWEEN $1 AND $2 AND o.Status != 'CANCELLED';`,
      [start, end]
    );
    const cogs = parseFloat(cogsRes.rows[0].cogs);

    // Compute gross margin
    const grossProfit = revenue - cogs;
    const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const issues = [];
    if (grossMarginPercent < 25) {
      issues.push('La marge brute est inférieure à 25% — veuillez vérifier les prix d\'achat ou de vente.');
    }

    return {
      period: { start, end },
      revenue,
      cogs,
      grossProfit,
      grossMarginPercent: parseFloat(grossMarginPercent.toFixed(2)),
      issues
    };
  }
}

module.exports = BiService;

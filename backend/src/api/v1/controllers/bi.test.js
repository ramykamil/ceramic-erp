const biController = require('./bi.controller');
const pool = require('../../../config/database');
const whatsappService = require('../services/whatsapp.service');

jest.mock('../../../config/database', () => {
  return {
    query: jest.fn(),
  };
});

describe('BI & WhatsApp Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BI Analytics Service & Controller', () => {
    it('should generate demand forecast correctly based on average sales velocity', async () => {
      pool.query.mockImplementation((sql, params) => {
        if (sql.includes('SELECT COALESCE(SUM(oi.Quantity)')) {
          return Promise.resolve({ rows: [{ total_sold: '300' }] });
        }
        if (sql.includes('SELECT COALESCE(SUM(QuantityOnHand)')) {
          return Promise.resolve({ rows: [{ current_stock: '150' }] });
        }
        if (sql.includes('SELECT ProductID, ProductName')) {
          return Promise.resolve({
            rows: [{ productid: 5, productname: 'Super Tile', productcode: 'ST-01', size: '60x60' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const req = { params: { productId: 5 }, query: { daysBack: 30 } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await biController.getDemandForecast(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          productId: 5,
          productName: 'Super Tile',
          totalSold: 300,
          dailyAverage: 10,
          weeklyForecast: 70,
          monthlyForecast: 300,
          currentStock: 150,
          daysUntilStockout: 15,
          reorderUrgent: false
        })
      });
    });

    it('should compute low stock predictions correctly for items at risk of running out', async () => {
      pool.query.mockImplementation((sql, params) => {
        if (sql.includes('SELECT oi.ProductID as productid')) {
          return Promise.resolve({
            rows: [{ productid: 8, productname: 'Low Tile', productcode: 'LT-01', total_sold_30d: '150' }]
          });
        }
        if (sql.includes('SELECT COALESCE(SUM(QuantityOnHand)')) {
          // current stock is 10, daily avg is 5, required for 7 days is 35, so at risk
          return Promise.resolve({ rows: [{ qty: 10 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const req = { query: { daysAhead: 7, daysBack: 30 } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await biController.getLowStockPredictions(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          forecastDays: 7,
          atRiskCount: 1,
          products: expect.arrayContaining([
            expect.objectContaining({
              productId: 8,
              productName: 'Low Tile',
              currentStock: 10,
              daysLeft: 2
            })
          ])
        })
      });
    });

    it('should calculate profit margins and list issues if margins fall below 25%', async () => {
      pool.query.mockImplementation((sql, params) => {
        if (sql.includes('SELECT COALESCE(SUM(TotalAmount - COALESCE(DeliveryCost, 0))')) {
          return Promise.resolve({ rows: [{ revenue: '10000' }] });
        }
        if (sql.includes('SELECT COALESCE(SUM(oi.Quantity * COALESCE(p.PurchasePrice')) {
          // cogs 8000, margin is 20% (under 25%)
          return Promise.resolve({ rows: [{ cogs: '8000' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const req = { query: { startDate: '2026-01-01', endDate: '2026-06-01' } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await biController.getProfitMarginAnalysis(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          revenue: 10000,
          cogs: 8000,
          grossProfit: 2000,
          grossMarginPercent: 20,
          issues: expect.arrayContaining([expect.stringContaining('La marge brute est inférieure à 25%')])
        })
      });
    });
  });

  describe('WhatsApp Notification Delivery', () => {
    it('should log successfully in sandbox/demo mode when sending invoices', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const req = {
        body: {
          phone: '+213660468894',
          type: 'INVOICE',
          invoiceNumber: 'INV-2026-00010',
          amount: '12500'
        }
      };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await biController.sendWhatsappNotification(req, res);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[WHATSAPP_SERVICE] Sending message to +213660468894'));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          success: true,
          logged: true,
          message: expect.stringContaining('Sandbox/Demo mode')
        })
      });

      consoleSpy.mockRestore();
    });

    it('should log successfully in sandbox/demo mode when sending overdue balance reminders', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const req = {
        body: {
          phone: '+213772611126',
          type: 'OVERDUE',
          customerName: 'Client B',
          balance: '45000'
        }
      };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await biController.sendWhatsappNotification(req, res);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[WHATSAPP_SERVICE] Sending message to +213772611126'));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          success: true,
          logged: true,
          message: expect.stringContaining('Sandbox/Demo mode')
        })
      });

      consoleSpy.mockRestore();
    });
  });
});

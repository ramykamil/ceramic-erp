const billingController = require('./billing.controller');
const { checkSubscription } = require('../middleware/subscription.middleware');
const pool = require('../../../config/database');

jest.mock('../../../config/database', () => {
  return {
    query: jest.fn(),
  };
});

describe('Billing & Subscription Lockout Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSubscription Middleware', () => {
    it('should bypass subscription checks for public / billing bypass paths', async () => {
      const req = { path: '/api/v1/billing/status', tenantId: 'some-uuid' };
      const res = {};
      const next = jest.fn();

      await checkSubscription(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('should allow active subscription tenants to pass', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ subscriptionstatus: 'ACTIVE', plantype: 'PREMIUM', trialenddate: '2099-12-31' }]
      });

      const req = { path: '/api/v1/orders', tenantId: 'tenant-active' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await checkSubscription(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should block expired/suspended subscription tenants immediately', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ subscriptionstatus: 'EXPIRED', plantype: 'TRIAL', trialenddate: '2026-01-01' }]
      });

      const req = { path: '/api/v1/orders', tenantId: 'tenant-expired' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await checkSubscription(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'SUBSCRIPTION_EXPIRED'
      }));
    });

    it('should perform lazy evaluation and block if trial date is in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      pool.query
        .mockResolvedValueOnce({
          rows: [{ subscriptionstatus: 'ACTIVE', plantype: 'TRIAL', trialenddate: pastDate.toISOString() }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update status query response

      const req = { path: '/api/v1/orders', tenantId: 'tenant-trial-past' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await checkSubscription(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE Tenants SET SubscriptionStatus = 'EXPIRED'"),
        ['tenant-trial-past']
      );
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Billing Controller', () => {
    it('should return correct trial status and days remaining', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15); // 15 days in future

      pool.query.mockResolvedValueOnce({
        rows: [{
          storename: 'My Store',
          plantype: 'TRIAL',
          subscriptionstatus: 'ACTIVE',
          trialstartdate: new Date().toISOString(),
          trialenddate: futureDate.toISOString(),
          createdat: new Date().toISOString()
        }]
      });

      const req = { tenantId: 'tenant-trial' };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await billingController.getBillingStatus(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          storeName: 'My Store',
          planType: 'TRIAL',
          subscriptionStatus: 'ACTIVE',
          daysRemaining: 15,
          isExpired: false
        })
      });
    });

    it('should allow mock upgrading plan type to BASIC/PREMIUM', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ plantype: 'PREMIUM', subscriptionstatus: 'ACTIVE', trialenddate: '2099-12-31' }]
      });

      const req = { tenantId: 'tenant-upgraded', body: { planType: 'PREMIUM' } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await billingController.subscribe(req, res, next);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE Tenants'),
        expect.arrayContaining(['PREMIUM', 'tenant-upgraded'])
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Abonnement PREMIUM activé avec succès.',
        data: expect.objectContaining({
          planType: 'PREMIUM',
          subscriptionStatus: 'ACTIVE'
        })
      });
    });
  });
});

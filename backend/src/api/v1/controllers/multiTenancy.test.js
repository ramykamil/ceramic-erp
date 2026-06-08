const authController = require('./auth.controller');
const tenantMiddleware = require('../middleware/tenant.middleware');
const pool = require('../../../config/database');
const { tenantStorage } = require('../utils/tenantContext');

jest.mock('../../../config/database', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  return {
    connect: jest.fn(() => Promise.resolve(mClient)),
    query: jest.fn(),
  };
});

describe('Multi-Tenancy Provisioning & Scoping Logic', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = pool.connect.mock.results[0]?.value || {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockClient.query = jest.fn();
    pool.connect.mockImplementation(() => Promise.resolve(mockClient));
  });

  describe('Store Registration (Provisioning)', () => {
    it('should create a tenant, set connection session parameters, and seed setting/warehouse/units/admin-user', async () => {
      mockClient.query.mockImplementation((sql, params) => {
        if (sql.includes('SELECT TenantID FROM Tenants')) {
          // Domain prefix is free
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('SELECT UserID FROM Users')) {
          // Username is free
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('INSERT INTO Tenants')) {
          return Promise.resolve({ rows: [{ tenantid: 'new-tenant-uuid' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const req = {
        body: {
          storeName: 'SaaS Ceramic Store',
          domainPrefix: 'saas-ceram',
          username: 'saasadmin',
          password: 'saaspassword',
          email: 'admin@saasceram.com'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await authController.registerStore(req, res, next);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

      // Verify the tenant context was initialized on the connection session
      const scopeCall = mockClient.query.mock.calls.find(call => 
        call[0].includes('SET app.current_tenant_id')
      );
      expect(scopeCall).toBeDefined();
      expect(scopeCall[1][0]).toBe('new-tenant-uuid');

      // Verify seed queries were executed
      const settingsSeed = mockClient.query.mock.calls.find(call => 
        call[0].includes('INSERT INTO AppSettings')
      );
      expect(settingsSeed).toBeDefined();
      expect(settingsSeed[1][0]).toBe('SaaS Ceramic Store');
      expect(settingsSeed[1][1]).toBe('new-tenant-uuid');

      const warehouseSeed = mockClient.query.mock.calls.find(call => 
        call[0].includes('INSERT INTO Warehouses')
      );
      expect(warehouseSeed).toBeDefined();

      const unitsSeed = mockClient.query.mock.calls.filter(call => 
        call[0].includes('INSERT INTO Units')
      );
      expect(unitsSeed.length).toBe(4);

      const adminUserSeed = mockClient.query.mock.calls.find(call => 
        call[0].includes('INSERT INTO Users')
      );
      expect(adminUserSeed).toBeDefined();
      expect(adminUserSeed[1][0]).toBe('saasadmin');

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        tenantId: 'new-tenant-uuid'
      }));
    });
  });

  describe('Tenant Scoping Middleware', () => {
    it('should scope requests to default tenant when no headers or auth tokens are present', (done) => {
      const req = { headers: {} };
      const res = {};
      const next = () => {
        expect(req.tenantId).toBe(tenantMiddleware.DEFAULT_TENANT_ID);
        expect(tenantStorage.getStore()).toBe(tenantMiddleware.DEFAULT_TENANT_ID);
        done();
      };

      tenantMiddleware.tenantScoping(req, res, next);
    });

    it('should scope requests to tenant ID specified in headers', (done) => {
      const customTenantId = 'custom-uuid-123';
      const req = {
        headers: {
          'x-tenant-id': customTenantId
        }
      };
      const res = {};
      const next = () => {
        expect(req.tenantId).toBe(customTenantId);
        expect(tenantStorage.getStore()).toBe(customTenantId);
        done();
      };

      tenantMiddleware.tenantScoping(req, res, next);
    });
  });
});

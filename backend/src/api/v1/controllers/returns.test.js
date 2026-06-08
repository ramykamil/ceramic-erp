const returnsController = require('./returns.controller');
const pool = require('../../../config/database');

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

describe('Returns Logic', () => {
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

  it('should create a return in PENDING status without adjusting stock immediately', async () => {
    mockClient.query.mockImplementation((sql, params) => {
      if (sql.includes("SELECT nextval('returns_seq')")) {
        return Promise.resolve({ rows: [{ nextval: 123 }] });
      }
      if (sql.includes('INSERT INTO Returns')) {
        return Promise.resolve({ rows: [{ returnid: 45, returnnumber: 'RET-2026-000123' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const req = {
      body: {
        customerId: 10,
        reason: 'Incorrect size',
        notes: 'Returning 5 cartons of tile',
        items: [
          { productId: 5, quantity: 5, unitId: 2, unitPrice: 1500, reason: 'Too small' }
        ]
      },
      user: { userId: 1 }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await returnsController.createReturn(req, res);

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Return created successfully',
      data: {
        returnId: 45,
        returnNumber: 'RET-2026-000123'
      }
    });

    // Verify no inventory updates happened during creation (creation keeps it PENDING)
    const invUpdateCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('UPDATE Inventory') || call[0].includes('INSERT INTO Inventory')
    );
    expect(invUpdateCall).toBeUndefined();
  });

  it('should adjust stock levels and update customer balance when a return is APPROVED', async () => {
    mockClient.query.mockImplementation((sql, params) => {
      if (sql.includes('SELECT Status, TotalAmount, CustomerID, ReturnNumber FROM Returns')) {
        return Promise.resolve({
          rows: [{ status: 'PENDING', totalamount: '7500', customerid: 10, returnnumber: 'RET-2026-000123' }]
        });
      }
      if (sql.includes('UPDATE Returns')) {
        return Promise.resolve({
          rows: [{ returnid: 45, returnnumber: 'RET-2026-000123', status: 'APPROVED' }]
        });
      }
      if (sql.includes('FROM ReturnItems')) {
        return Promise.resolve({
          rows: [{
            productid: 5,
            quantity: 5,
            unitcode: 'SQM',
            primaryunitcode: 'SQM',
            size: '60x60',
            productname: 'Ceramic Floor'
          }]
        });
      }
      if (sql.includes('FROM Returns r') && sql.includes('WarehouseID')) {
        return Promise.resolve({
          rows: [{ orderid: 1, returnnumber: 'RET-2026-000123', warehouseid: 1, customername: 'Client A', customertype: 'WHOLESALE' }]
        });
      }
      if (sql.includes('SELECT InventoryID FROM Inventory')) {
        return Promise.resolve({ rows: [{ inventoryid: 12 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const req = {
      params: { id: 45 },
      body: { status: 'APPROVED' },
      user: { userId: 1 }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await returnsController.updateReturnStatus(req, res);

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

    // Verify QuantityOnHand was incremented
    const stockUpdateCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('UPDATE Inventory') && call[0].includes('QuantityOnHand = QuantityOnHand + $1')
    );
    expect(stockUpdateCall).toBeDefined();
    expect(stockUpdateCall[1][0]).toBe(5);

    // Verify InventoryTransactions was logged
    const invTxCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('INSERT INTO InventoryTransactions') && call[1] && call[1].some(val => String(val).includes('Approved'))
    );
    expect(invTxCall).toBeDefined();

    // Verify Customer balance reduction
    const customerUpdateCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('UPDATE Customers SET CurrentBalance = CurrentBalance - $1')
    );
    expect(customerUpdateCall).toBeDefined();
    expect(customerUpdateCall[1][0]).toBe(7500);
  });
});

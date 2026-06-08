const orderController = require('./order.controller');
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

describe('Order Cancellation Logic', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = pool.connect.mock.results[0]?.value || {
      query: jest.fn(),
      release: jest.fn(),
    };
    // Ensure mockClient resolves queries properly
    mockClient.query = jest.fn();
    pool.connect.mockImplementation(() => Promise.resolve(mockClient));
  });

  it('should revert QuantityReserved when a PENDING order is CANCELLED', async () => {
    // 1. Mock Order Select
    mockClient.query.mockImplementation((sql, params) => {
      if (sql.includes('SELECT OrderNumber, Status, WarehouseID, CustomerID, TotalAmount, PaymentAmount, PaymentMethod')) {
        return Promise.resolve({
          rows: [{
            ordernumber: 'ORD-2026-000001',
            status: 'PENDING',
            warehouseid: 1,
            customerid: 10,
            totalamount: '5000',
            paymentamount: '0',
            paymentmethod: 'ESPECE'
          }]
        });
      }
      if (sql.includes('SELECT oi.*, p.ProductName')) {
        return Promise.resolve({
          rows: [{
            productid: 5,
            quantity: 10,
            unitcode: 'SQM',
            primaryunitcode: 'SQM',
            size: '60x60',
            qteparcolis: '1.44',
            qtecolisparpalette: '40',
            productname: 'Ceramic Floor'
          }]
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const req = {
      params: { id: 1 },
      body: { status: 'CANCELLED' },
      user: { userId: 1 },
      ip: '127.0.0.1',
      headers: {}
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    const next = jest.fn();

    await orderController.updateOrderStatus(req, res, next);

    // Verify BEGIN and COMMIT transactions were run
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

    // Verify QuantityReserved was reverted (decreased)
    const reserveUpdateCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('UPDATE Inventory') && call[0].includes('QuantityReserved = GREATEST(0, QuantityReserved - $1)')
    );
    expect(reserveUpdateCall).toBeDefined();
    // 10 SQM
    expect(reserveUpdateCall[1][0]).toBe(10);
    expect(reserveUpdateCall[1][1]).toBe(5); // ProductID
  });

  it('should revert QuantityOnHand and record transaction when a CONFIRMED order is CANCELLED', async () => {
    mockClient.query.mockImplementation((sql, params) => {
      if (sql.includes('SELECT OrderNumber, Status, WarehouseID, CustomerID, TotalAmount, PaymentAmount, PaymentMethod')) {
        return Promise.resolve({
          rows: [{
            ordernumber: 'ORD-2026-000002',
            status: 'CONFIRMED',
            warehouseid: 1,
            customerid: 12,
            totalamount: '10000',
            paymentamount: '3000',
            paymentmethod: 'ESPECE'
          }]
        });
      }
      if (sql.includes('SELECT oi.*, p.ProductName')) {
        return Promise.resolve({
          rows: [{
            productid: 8,
            quantity: 20,
            unitcode: 'SQM',
            primaryunitcode: 'SQM',
            size: '60x60',
            productname: 'Wall Tile'
          }]
        });
      }
      if (sql.includes('SELECT TransactionID, AccountID, Amount, TransactionType FROM CashTransactions')) {
        return Promise.resolve({
          rows: [
            { transactionid: 101, accountid: 1, amount: 10000, transactiontype: 'VENTE' },
            { transactionid: 102, accountid: 1, amount: 3000, transactiontype: 'VERSEMENT' }
          ]
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const req = {
      params: { id: 2 },
      body: { status: 'CANCELLED' },
      user: { userId: 1 },
      ip: '127.0.0.1',
      headers: {}
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    const next = jest.fn();

    await orderController.updateOrderStatus(req, res, next);

    // Assert no errors occurred
    expect(next).not.toHaveBeenCalled();

    // Verify QuantityOnHand was incremented back
    const stockUpdateCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('UPDATE Inventory') && call[0].includes('QuantityOnHand = QuantityOnHand + $1')
    );
    expect(stockUpdateCall).toBeDefined();
    expect(stockUpdateCall[1][0]).toBe(20);

    // Verify InventoryTransactions was written for audit
    const invTxCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('INSERT INTO InventoryTransactions') && call[1] && call[1].some(val => String(val).includes('Annulation'))
    );
    expect(invTxCall).toBeDefined();

    // Verify Customer balance reduction query (reverting unpaid balance)
    const customerUpdateCall = mockClient.query.mock.calls.find(call => 
      call[0].includes('UPDATE Customers SET CurrentBalance = CurrentBalance - $1')
    );
    expect(customerUpdateCall).toBeDefined();
    // unpaid is 10000 - 3000 = 7000
    expect(customerUpdateCall[1][0]).toBe(7000);

    // Verify Cash accounts were reverted and cash transactions deleted
    const cashAccountUpdateCalls = mockClient.query.mock.calls.filter(call => 
      call[0].includes('UPDATE CashAccounts SET Balance = Balance - $1')
    );
    expect(cashAccountUpdateCalls.length).toBe(2);

    const deleteTxCalls = mockClient.query.mock.calls.filter(call => 
      call[0].includes('DELETE FROM CashTransactions')
    );
    expect(deleteTxCalls.length).toBe(2);
  });
});

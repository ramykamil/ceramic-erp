const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

const productController = require('../controllers/product.controller');
const pricingController = require('../controllers/pricing.controller');
const factoryController = require('../controllers/factory.controller'); // NEW
const customerController = require('../controllers/customer.controller');
const orderController = require('../controllers/order.controller');
// Add other controllers that were present before to avoid breaking other features if possible, 
// but the user instruction said "Overwrite ... with complete, correct code" and provided a specific block.
// However, the user also said "Fix & Finish", implying I shouldn't break existing stuff.
// The provided block in the prompt seems to be a subset.
// I should probably try to keep existing routes if they are not conflicting.
// BUT, the prompt explicitly says "Overwrite ... with complete, correct code" and gives a block that looks like it might be missing things like 'inventory', 'reports', 'logistics'.
// Wait, looking at the previous file content (Step 158), there are MANY controllers and routes.
// The user prompt Step 6 has a comment "// ... (Keep other exports like setCustomerPrice, import, export, bulkSet) ..." in the controller section,
// but for routes it says "Action: Overwrite backend/src/api/v1/routes/index.js" and gives a block that is MISSING a lot of things (Inventory, Reports, Logistics, Auth, etc).
// If I overwrite with JUST what is in the prompt, I will break the app significantly.
// "Crash Cause: Likely routes/index.js referencing undefined functions ... or route ordering issues".
// The goal is to FIX the crash.
// I should MERGE the user's requested changes (Order of products, new factory route) into the EXISTING file, rather than deleting everything else.
// The user prompt says "Overwrite ... with complete, correct code". This is tricky.
// Usually "Overwrite" means replace entirely. But if the provided code is incomplete, that's bad.
// Let's look at the provided code in Step 6 again. It ends with `module.exports = router;`.
// It has `// --- Public ---`, `// --- Products ---`, etc.
// It is missing `authController`, `inventoryController`, `logisticsController`, etc.
// I will assume the user wants me to FIX the file by applying the structure they showed, but keeping the other existing routes.
// I will reconstruct the file to include ALL existing controllers and routes, but applying the fixes (ordering, new controller).

const categoryController = require('../controllers/category.controller');
const brandController = require('../controllers/brand.controller');
const unitController = require('../controllers/unit.controller');
const authController = require('../controllers/auth.controller');
const warehouseController = require('../controllers/warehouse.controller');
const inventoryController = require('../controllers/inventory.controller');
const purchaseOrderController = require('../controllers/purchaseOrder.controller');
const pricelistsController = require('../controllers/pricelists.controller');
const goodsReceiptController = require('../controllers/goodsReceipt.controller');
const reportsController = require('../controllers/reports.controller');
const logisticsController = require('../controllers/logistics.controller');
const settlementsController = require('../controllers/settlements.controller');
const adminController = require('../controllers/admin.controller');
const employeesController = require('../controllers/employees.controller');
const attendanceController = require('../controllers/attendance.controller');
const returnsController = require('../controllers/returns.controller');

// --- Public ---
router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.post('/auth/login', authController.login);

// --- Products (Order matters!) ---
router.get('/products/sizes', authenticateToken, productController.getProductSizes); // Specific route first
router.get('/products/export', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES'), productController.exportProducts); // Specific route first
router.get('/products/filters', authenticateToken, productController.getProductFilters); // NEW: Get filters fast
router.post('/products/import', authenticateToken, requireRole('ADMIN', 'MANAGER'), upload.single('file'), productController.importProducts); // Specific route first
router.post('/products/fix-metadata', authenticateToken, requireRole('ADMIN'), productController.fixProductMetadata);
router.get('/products', authenticateToken, productController.getProducts); // General list
router.get('/products/:id', authenticateToken, productController.getProductById); // Generic ID capture (LAST)
router.put('/products/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), productController.updateProduct);
router.delete('/products/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), productController.deleteProduct);
router.get('/products/:id/sales-history', authenticateToken, productController.getProductSalesHistory);
router.get('/products/:productId/units', authenticateToken, productController.getProductUnits); // This might conflict if :id captures it, but :productId is different param name? No, express matches path.
// Actually /products/:productId/units is /products/:id/units. It is more specific than /products/:id? 
// No, /products/:id matches /products/123. It does NOT match /products/123/units.
// So /products/:id is fine before /products/:id/units?
// Wait, /products/:id matches "123". It does not match "123/units".
// So /products/:id/units is safe.
// BUT /products/sizes matches /products/:id if sizes is treated as id.
// So sizes MUST be before :id.
// /products/export matches /products/:id. So export MUST be before :id.


// --- Pricing & Rules ---
router.get('/customers/:customerId/prices', authenticateToken, pricingController.getCustomerPrices);
router.get('/customers/:customerId/rules', authenticateToken, pricingController.getCustomerRules);
router.post('/customers/:customerId/rules', authenticateToken, requireRole('ADMIN', 'MANAGER'), pricingController.setCustomerRule);
router.delete('/customers/:customerId/rules/:ruleId', authenticateToken, requireRole('ADMIN', 'MANAGER'), pricingController.deleteCustomerRule);
router.get('/pricing/product/:productId/customer/:customerId', authenticateToken, pricingController.getProductPrice);
router.post('/customers/:customerId/prices', authenticateToken, requireRole('ADMIN', 'MANAGER'), pricingController.setCustomerPrice);
router.delete('/customers/:customerId/prices/:productId', authenticateToken, requireRole('ADMIN', 'MANAGER'), pricingController.deleteCustomerPrice);
router.post('/customers/:customerId/prices/import', authenticateToken, requireRole('ADMIN', 'MANAGER'), upload.single('file'), pricingController.importCustomerPrices);
router.post('/customers/:customerId/prices/bulk-set', authenticateToken, requireRole('ADMIN', 'MANAGER'), pricingController.bulkSetCustomerPrices);
router.get('/customers/:customerId/prices/export', authenticateToken, pricingController.exportCustomerPrices);

// --- Factories ---
router.get('/factories', authenticateToken, factoryController.getAllFactories);

// --- Customers ---
router.get('/customers', authenticateToken, customerController.getCustomers);
// Specific routes MUST come before generic :id routes
router.get('/customers/:customerId/product-price/:productId', authenticateToken, customerController.getCustomerProductPrice);
router.get('/customers/stats', authenticateToken, customerController.getCustomerStats);
router.get('/customers/:id', authenticateToken, customerController.getCustomerById);
router.post('/customers', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES', 'SALES_WHOLESALE', 'SALES_RETAIL'), customerController.createCustomer);
router.put('/customers/:id', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES', 'SALES_WHOLESALE', 'SALES_RETAIL'), customerController.updateCustomer);
router.delete('/customers/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), customerController.deleteCustomer);
router.delete('/customers/hard/:id', authenticateToken, requireRole('ADMIN'), customerController.hardDeleteCustomer);

// --- Orders ---
router.get('/orders', authenticateToken, orderController.getOrders);
router.get('/orders/:id', authenticateToken, orderController.getOrderById);
router.post('/orders', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES', 'SALES_RETAIL', 'SALES_WHOLESALE'), orderController.createOrder);
router.post('/orders/:orderId/items', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES', 'SALES_RETAIL', 'SALES_WHOLESALE'), orderController.addOrderItem);
router.post('/orders/:orderId/finalize', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES', 'SALES_RETAIL', 'SALES_WHOLESALE'), orderController.finalizeOrder);
router.put('/orders/:id/status', authenticateToken, requireRole('ADMIN', 'MANAGER'), orderController.updateOrderStatus);

// --- Categories ---
router.get('/categories', authenticateToken, categoryController.getAllCategories);

// --- Brands ---
router.get('/brands', authenticateToken, brandController.getAllBrands);
router.post('/brands', authenticateToken, requireRole('ADMIN', 'MANAGER'), brandController.createBrand);
router.get('/brands/:id', authenticateToken, brandController.getBrandById);
router.put('/brands/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), brandController.updateBrand);
router.delete('/brands/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), brandController.deleteBrand);

// --- Units ---
router.get('/units', authenticateToken, unitController.getAllUnits);

// --- Warehouses ---
router.get('/warehouses', authenticateToken, warehouseController.getAllWarehouses);

// --- Inventory ---
router.get('/inventory/levels', authenticateToken, inventoryController.getInventoryLevels);
router.get('/inventory/transactions', authenticateToken, inventoryController.getInventoryTransactions);
router.get('/inventory/export', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), inventoryController.exportStock);
router.post('/inventory/import', authenticateToken, requireRole('ADMIN', 'MANAGER'), upload.single('file'), inventoryController.importStock);
router.post('/inventory/adjust', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), inventoryController.adjustStock);

// --- Returns ---
router.get('/returns', authenticateToken, returnsController.getReturns);
router.get('/returns/:id', authenticateToken, returnsController.getReturnById);
router.post('/returns', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES'), returnsController.createReturn);
router.put('/returns/:id/status', authenticateToken, requireRole('ADMIN', 'MANAGER'), returnsController.updateReturnStatus);
router.delete('/returns/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), returnsController.deleteReturn);

// --- Quick Stock Entry ---
const quickStockController = require('../controllers/quickStock.controller');
router.get('/quick-stock', authenticateToken, quickStockController.getQuickStockItems);
router.post('/quick-stock', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES'), quickStockController.addQuickStockItem);
router.put('/quick-stock/:id', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES'), quickStockController.updateQuickStockItem);
router.delete('/quick-stock/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), quickStockController.deleteQuickStockItem);
router.post('/quick-stock/:id/sell', authenticateToken, requireRole('ADMIN', 'MANAGER', 'SALES'), quickStockController.sellQuickStockItem);

// --- Reports ---
router.get('/reports/employee-stats/:employeeId', authenticateToken, requireRole('ADMIN', 'MANAGER'), reportsController.getEmployeeStats);
router.get('/reports/sessions', authenticateToken, requireRole('ADMIN', 'MANAGER'), reportsController.getSessionHistory);
router.get('/reports/dashboard-summary', authenticateToken, reportsController.getDashboardSummary);
// New comprehensive reports
router.get('/reports/sales', authenticateToken, reportsController.getSalesReport);
router.get('/reports/purchases', authenticateToken, reportsController.getPurchasesReport);
router.get('/reports/financials', authenticateToken, reportsController.getFinancialsReport);
router.get('/reports/payments', authenticateToken, reportsController.getPaymentsReport);
router.get('/reports/top-products', authenticateToken, reportsController.getTopProductsReport);
router.get('/reports/products-detail', authenticateToken, reportsController.getProductsDetailReport);
router.get('/reports/clients', authenticateToken, reportsController.getClientsReport);
router.get('/reports/top-brands', authenticateToken, reportsController.getTopBrandsReport);
router.get('/reports/clients-balance', authenticateToken, reportsController.getClientsBalance);
router.get('/reports/suppliers-balance', authenticateToken, reportsController.getSuppliersBalance);

// --- Admin ---
router.post('/admin/extract-sizes', authenticateToken, requireRole('ADMIN'), adminController.runSizeExtraction);

// --- Price Lists ---
router.get('/pricelists', authenticateToken, pricelistsController.getAllPriceLists);

// --- Purchase Orders ---
router.get('/purchase-orders', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE', 'SALES'), purchaseOrderController.getPurchaseOrders);
router.get('/purchase-orders/history', authenticateToken, requireRole('ADMIN', 'MANAGER'), purchaseOrderController.getPurchaseHistory);
router.get('/purchase-orders/history/:factoryId', authenticateToken, requireRole('ADMIN', 'MANAGER'), purchaseOrderController.getFactoryPurchaseDetails);
router.post('/purchase-orders', authenticateToken, requireRole('ADMIN', 'MANAGER'), purchaseOrderController.createPurchaseOrder);
router.get('/purchase-orders/:id', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE', 'SALES'), purchaseOrderController.getPurchaseOrderById);

// --- Goods Receipts ---
router.get('/goods-receipts', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), goodsReceiptController.getGoodsReceipts);
router.post('/goods-receipts', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), goodsReceiptController.createGoodsReceipt);

// --- Logistics ---
router.get('/logistics/vehicles', authenticateToken, logisticsController.getVehicles);
router.post('/logistics/vehicles', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.createVehicle);
router.put('/logistics/vehicles/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.updateVehicle);
router.delete('/logistics/vehicles/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.deleteVehicle);
router.get('/logistics/drivers', authenticateToken, logisticsController.getDrivers);
router.post('/logistics/drivers', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.createDriver);
router.put('/logistics/drivers/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.updateDriver);
router.delete('/logistics/drivers/:id', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.deleteDriver);
router.get('/logistics/deliveries', authenticateToken, logisticsController.getDeliveries);
router.post('/logistics/deliveries', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), logisticsController.createDelivery);
router.patch('/logistics/deliveries/:id/status', authenticateToken, logisticsController.updateDeliveryStatus);

// Simplified Logistics
router.get('/drivers', authenticateToken, logisticsController.getDrivers);
router.get('/vehicles', authenticateToken, logisticsController.getVehicles);
router.post('/deliveries', authenticateToken, requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), logisticsController.createDelivery);
router.post('/vehicles', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.createVehicle);
router.post('/drivers', authenticateToken, requireRole('ADMIN', 'MANAGER'), logisticsController.createDriver);
router.get('/employees/potential-drivers', authenticateToken, logisticsController.getPotentialDrivers);

// --- Settlements ---
router.get('/settlements/factories', authenticateToken, settlementsController.getFactories);
router.post('/settlements/generate', authenticateToken, requireRole(['ADMIN', 'MANAGER']), settlementsController.generateSettlement);
router.get('/settlements', authenticateToken, requireRole(['ADMIN', 'MANAGER']), settlementsController.getSettlements);
router.patch('/settlements/:id/status', authenticateToken, requireRole(['ADMIN', 'MANAGER']), settlementsController.updateSettlementStatus);

// --- HR ---
router.get('/employees', authenticateToken, requireRole(['ADMIN', 'MANAGER']), employeesController.getEmployees);
router.get('/employees/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER']), employeesController.getEmployeeById);
router.post('/employees', authenticateToken, requireRole(['ADMIN']), employeesController.createEmployee);
router.put('/employees/:id', authenticateToken, requireRole(['ADMIN']), employeesController.updateEmployee);
router.post('/attendance/clock-in', authenticateToken, attendanceController.clockIn);
router.post('/attendance/clock-out', authenticateToken, attendanceController.clockOut);
router.get('/attendance', authenticateToken, requireRole(['ADMIN', 'MANAGER']), attendanceController.getAttendanceHistory);

// --- Accounting (Caisse) ---
const accountingController = require('../controllers/accounting.controller');
router.get('/accounting/accounts', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.getCashAccounts);
router.post('/accounting/accounts', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.createCashAccount);
router.delete('/accounting/accounts/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.deleteCashAccount);
router.put('/accounting/accounts/:id/default', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.setDefaultCashAccount);
router.get('/accounting/accounts/:id/journal', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.getAccountJournal);
router.get('/accounting/transactions', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.getCashTransactions);
router.post('/accounting/transactions', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.createCashTransaction);
router.get('/accounting/summary', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.getCashSummary);
router.post('/accounting/transfers', authenticateToken, requireRole(['ADMIN', 'MANAGER']), accountingController.createCashTransfer);

// --- Settings ---
// --- Settings ---
const settingsController = require('../controllers/settings.controller');
router.get('/settings', authenticateToken, settingsController.getSettings);
router.put('/settings', authenticateToken, requireRole(['ADMIN']), settingsController.updateSettings);
router.post('/settings/backup', authenticateToken, requireRole(['ADMIN']), settingsController.triggerBackup);
router.get('/settings/sessions', authenticateToken, requireRole(['ADMIN']), settingsController.getActiveSessions);
router.get('/settings/users', authenticateToken, requireRole(['ADMIN']), settingsController.getUsers);
router.post('/settings/users', authenticateToken, requireRole(['ADMIN']), settingsController.createUser);
router.put('/settings/users/:id', authenticateToken, requireRole(['ADMIN']), settingsController.updateUser);
router.delete('/settings/users/:id', authenticateToken, requireRole(['ADMIN']), settingsController.deleteUser);

const auditController = require('../controllers/audit.controller');
router.get('/settings/audit', authenticateToken, requireRole(['ADMIN']), auditController.getAuditLogs);

// --- Salespersons List (for filtering) - accessible by ADMIN, MANAGER, SALES_WHOLESALE ---
router.get('/users/salespersons', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'SALES_WHOLESALE']), settingsController.getUsers);

module.exports = router;



-- =============================================
-- FIX SEQUENCES SCRIPT
-- Run this if you get "Unique Violation" or "Duplicate Key" errors
-- when creating Users, Products, or Orders.
-- =============================================

BEGIN;

-- 1. Users & Employees
SELECT setval('users_userid_seq', COALESCE((SELECT MAX(UserID) FROM Users), 1));
SELECT setval('employees_employeeid_seq', COALESCE((SELECT MAX(EmployeeID) FROM Employees), 1));

-- 2. Products & Inventory
SELECT setval('products_productid_seq', COALESCE((SELECT MAX(ProductID) FROM Products), 1));
SELECT setval('brands_brandid_seq', COALESCE((SELECT MAX(BrandID) FROM Brands), 1));
SELECT setval('categories_categoryid_seq', COALESCE((SELECT MAX(CategoryID) FROM Categories), 1));
SELECT setval('units_unitid_seq', COALESCE((SELECT MAX(UnitID) FROM Units), 1));
SELECT setval('inventory_inventoryid_seq', COALESCE((SELECT MAX(InventoryID) FROM Inventory), 1));
SELECT setval('inventorytransactions_transactionid_seq', COALESCE((SELECT MAX(TransactionID) FROM InventoryTransactions), 1));

-- 3. Sales & Orders
SELECT setval('customers_customerid_seq', COALESCE((SELECT MAX(CustomerID) FROM Customers), 1));
SELECT setval('orders_orderid_seq', COALESCE((SELECT MAX(OrderID) FROM Orders), 1));
SELECT setval('orderitems_orderitemid_seq', COALESCE((SELECT MAX(OrderItemID) FROM OrderItems), 1));
SELECT setval('invoices_invoiceid_seq', COALESCE((SELECT MAX(InvoiceID) FROM Invoices), 1));
SELECT setval('payments_paymentid_seq', COALESCE((SELECT MAX(PaymentID) FROM Payments), 1));

-- 4. Purchases
SELECT setval('purchaseorders_purchaseorderid_seq', COALESCE((SELECT MAX(PurchaseOrderID) FROM PurchaseOrders), 1));
SELECT setval('goodsreceipts_receiptid_seq', COALESCE((SELECT MAX(ReceiptID) FROM GoodsReceipts), 1));
SELECT setval('purchaseorderitems_poitemid_seq', COALESCE((SELECT MAX(POItemID) FROM PurchaseOrderItems), 1));
SELECT setval('goodsreceiptitems_receiptitemid_seq', COALESCE((SELECT MAX(ReceiptItemID) FROM GoodsReceiptItems), 1));

COMMIT;

SELECT 'All sequences have been synchronized.' as status;

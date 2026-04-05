'''markdown
# RESTful API Endpoints Design

This document outlines the key RESTful API endpoints for the ERP system, organized by module.

**Base URL:** `/api/v1`

---

### Module 1: Catalog & Product Master

-   `GET /products` - List all products (with pagination, filtering, sorting)
-   `POST /products` - Create a new product
-   `GET /products/:id` - Get a single product by ID
-   `PUT /products/:id` - Update a product
-   `DELETE /products/:id` - Deactivate/delete a product
-   `GET /categories` - List all product categories
-   `POST /categories` - Create a new category
-   `GET /brands` - List all brands
-   `GET /units` - List all measurement units

### Module 2: Inventory & Warehousing

-   `GET /inventory` - Get current inventory levels across all warehouses
-   `GET /inventory/product/:productId` - Get inventory for a specific product
-   `GET /inventory/warehouse/:warehouseId` - Get inventory for a specific warehouse
-   `POST /inventory/adjust` - Make an inventory adjustment
-   `GET /inventory/transactions` - Get a log of all inventory transactions
-   `GET /warehouses` - List all warehouses
-   `GET /factories` - List all factories/suppliers

### Module 3: Pricing & Price Lists (and Customer-Specific Pricing)

-   `GET /pricelists` - List all price lists
-   `POST /pricelists` - Create a new price list
-   `GET /pricelists/:id` - Get a specific price list with its items
-   `POST /pricelists/:id/items` - Add a product to a price list
-   `PUT /pricelists/items/:itemId` - Update a price list item

-   **`GET /customers/:id/prices`** - **CRITICAL:** Get the list of specific, negotiated prices for a single customer.
-   **`POST /customers/:id/prices`** - **CRITICAL:** Create or update a specific price for a customer and product.
-   **`DELETE /customers/:id/prices/:productId`** - **CRITICAL:** Remove a specific customer-product price.
-   **`POST /customers/:id/prices/import`** - **CRITICAL:** Bulk import customer-specific prices from a CSV/Excel file.
-   **`GET /customers/:id/prices/export`** - **CRITICAL:** Export all specific prices for a customer.

### Module 4 & 5: Sales, POS, Wholesale & Orders

-   `GET /orders` - List all orders
-   `POST /orders` - Create a new order (retail, wholesale, or consignment)
-   `GET /orders/:id` - Get a single order by ID
-   `PUT /orders/:id` - Update an order (e.g., change status)
-   `POST /orders/:id/items` - Add an item to an existing order
-   `GET /orders/:id/calculate-price` - **LOGIC:** Endpoint to trigger the "Price Waterfall" for an item being added to an order. (Internal or public)
-   `GET /invoices` - List all invoices
-   `POST /invoices` - Create an invoice from an order
-   `GET /invoices/:id` - Get a single invoice

### Module 6: Purchasing & Receipts

-   `GET /purchase-orders` - List all purchase orders
-   `POST /purchase-orders` - Create a new purchase order
-   `GET /purchase-orders/:id` - Get a single PO
-   `PUT /purchase-orders/:id/status` - Update PO status (e.g., to 'Approved')
-   `GET /goods-receipts` - List all goods receipts
-   `POST /goods-receipts` - Create a new goods receipt from a PO

### Module 7: Factory Settlements & Commissioning

-   `GET /settlements/factory/:factoryId` - List all settlements for a factory
-   `POST /settlements` - Create a new settlement period for a factory
-   `GET /settlements/:id` - Get details of a single settlement
-   `POST /settlements/:id/finalize` - Finalize and lock a settlement for payment

### Module 8: Customers & CRM

-   `GET /customers` - List all customers
-   `POST /customers` - Create a new customer
-   `GET /customers/:id` - Get a single customer by ID
-   `PUT /customers/:id` - Update customer details
-   `GET /customers/:id/interactions` - Get CRM interactions for a customer
-   `POST /customers/:id/interactions` - Log a new CRM interaction

### Module 9: Accounting & Payments

-   `GET /payments` - List all payments (receipts and payouts)
-   `POST /payments/receipt` - Record a customer payment against an invoice
-   `POST /payments/payout` - Record a payment to a factory or for an expense
-   `GET /accounting/journal` - Get the general journal entries for a date range

### Module 10: Payroll & HR

-   `GET /employees` - List all employees
-   `POST /employees` - Add a new employee
-   `GET /employees/:id` - Get a single employee's details
-   `GET /attendance` - Get attendance records
-   `POST /attendance/clock-in` - Clock in an employee
-   `POST /attendance/clock-out` - Clock out an employee
-   `GET /payroll` - List payroll runs
-   `POST /payroll/run` - Start a new payroll run for a period

### Module 11: Fleet & Logistics

-   `GET /deliveries` - List all deliveries
-   `POST /deliveries` - Create a new delivery from an order
-   `GET /deliveries/:id` - Get a single delivery's details and status
-   `PUT /deliveries/:id/status` - Update delivery status (e.g., 'IN_TRANSIT', 'DELIVERED')
-   `POST /deliveries/:id/pod` - Upload a Proof of Delivery (POD) image/signature
-   `GET /vehicles` - List all vehicles in the fleet
-   `GET /drivers` - List all drivers

### Module 12: Reporting & Dashboards

-   `GET /reports/sales-summary` - Get a summary of sales over a period
-   `GET /reports/inventory-valuation` - Get the current value of all inventory
-   `GET /reports/customer-profitability` - Get a report on top customers by sales/profit
-   `GET /reports/factory-consignment` - Get a report on consignment stock performance

### Module 13: Admin, Security & Audit

-   `GET /users` - List all users
-   `POST /users` - Create a new user
-   `PUT /users/:id/role` - Assign a role to a user
-   `GET /roles` - List all available roles
-   `GET /audit-logs` - Get the system audit trail

### Module 14: Data Import/Export

-   `GET /import/jobs` - List all import job statuses
-   `GET /import/jobs/:id` - Get the status and error log for a specific job
-   `POST /import/products` - (Example) Endpoint to handle product data import.

### Module 15: Mobile Apps (Driver & Warehouse)

These endpoints are optimized for mobile use cases and may be a subset of the main API.

-   `GET /mobile/driver/deliveries` - Get the list of assigned deliveries for the logged-in driver.
-   `PUT /mobile/driver/deliveries/:id/start` - Mark a delivery as started.
-   `POST /mobile/driver/deliveries/:id/capture-pod` - Upload POD for a delivery.
-   `GET /mobile/warehouse/po/:poId` - Get details of a purchase order for receiving.
-   `POST /mobile/warehouse/receive` - Receive stock against a PO.
-   `GET /mobile/warehouse/lookup` - Look up product inventory information by scanning a barcode.
'''

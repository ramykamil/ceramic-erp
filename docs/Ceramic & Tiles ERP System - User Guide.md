# Ceramic & Tiles ERP System - User Guide

## Overview

This is a complete, production-ready ERP system designed specifically for ceramic and tiles distributors who operate as both retailers and wholesalers. The system includes a critical **Price Waterfall** feature that automatically applies the correct pricing based on customer-specific contracts, price lists, or base prices.

## System Architecture

### Technology Stack

- **Backend:** Node.js with Express.js
- **Frontend:** Next.js 16 with React 19 and Tailwind CSS
- **Database:** PostgreSQL 14
- **Authentication:** JWT-based authentication

### Key Features

1. **Price Waterfall Logic (CRITICAL FEATURE)**
   - Level 1: Customer-specific contract prices
   - Level 2: Customer's assigned price list
   - Level 3: Product base price
   - Automatic price calculation when adding items to orders

2. **Multi-Warehouse Inventory Management**
   - Track company-owned stock
   - Track factory-owned consignment stock
   - Real-time inventory levels

3. **Comprehensive Customer Management**
   - Retail and wholesale customer types
   - Credit limits and payment terms
   - Customer-specific pricing with bulk import/export

4. **Point of Sale (POS) / Order Creation**
   - Fast product search
   - Automatic price calculation
   - Real-time order totals
   - Visual price source indicators

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 14+
- pnpm package manager

### Installation

1. **Database Setup**
   ```bash
   # Start PostgreSQL
   sudo service postgresql start
   
   # Database is already created as 'ceramic_erp'
   # Schema and seed data are already loaded
   ```

2. **Backend Setup**
   ```bash
   cd ceramic-erp-platform/backend
   npm install
   npm run seed  # Load sample data (already done)
   npm run dev   # Start development server
   ```

3. **Frontend Setup**
   ```bash
   cd ceramic-erp-platform/frontend
   pnpm install
   pnpm dev      # Start development server
   ```

### Default Credentials

- **Username:** admin
- **Password:** admin123

## Sample Data

The system comes pre-loaded with sample data:

### Customers

1. **ABC Construction Ltd** (CUST-001)
   - Type: WHOLESALE
   - Price List: Wholesale
   - Special Prices: Yes (2 products with negotiated prices)

2. **XYZ Retail Store** (CUST-002)
   - Type: RETAIL
   - Price List: Retail

3. **BuildRight Contractors** (CUST-003)
   - Type: WHOLESALE
   - Price List: Wholesale
   - Special Prices: Yes (1 product with contract price)

### Products

1. **TILE-001** - Royal White Ceramic 30x30
   - Base Price: $15.00
   - Retail Price: $18.00
   - Wholesale Price: $12.00
   - ABC Construction Special: $10.50 (CONTRACT)

2. **TILE-002** - Elite Porcelain Grey 60x60
   - Base Price: $45.00
   - Retail Price: $55.00
   - Wholesale Price: $40.00
   - ABC Construction Special: $38.00 (CONTRACT)

3. **SINK-001** - Modern Basin White
   - Base Price: $150.00
   - Retail Price: $180.00
   - Wholesale Price: $135.00

## User Guide

### 1. Creating an Order (POS Screen)

**Path:** Dashboard → Sales & POS

**Steps:**

1. **Select Customer**
   - Choose a customer from the dropdown
   - View customer details (type, price list, current balance)

2. **Add Products**
   - Search for products by name or code
   - Select a product from the search results
   - The system automatically calculates the price using the Price Waterfall
   - See the price source indicator (CONTRACT, PRICELIST, or BASE)
   - Enter quantity
   - Click "Add to Order"

3. **Review Order**
   - View all items in the order summary
   - Check subtotal, tax, and total
   - Remove items if needed

4. **Confirm Order**
   - Click "Confirm Order"
   - System creates the order and reserves inventory
   - Order number is generated automatically

**Price Waterfall in Action:**

When you add a product to an order for ABC Construction (CUST-001):
- **TILE-001** shows $10.50 with "CONTRACT" badge (customer-specific price)
- **TILE-003** shows $12.00 with "PRICELIST" badge (wholesale price list)
- Any product without specific or list price shows "BASE" badge

### 2. Managing Customer-Specific Prices

**Path:** Dashboard → Customers → Select Customer

**Features:**

#### View Specific Prices
- See all negotiated prices for the customer
- Compare specific price vs. base price
- View savings percentage
- Check effective dates

#### Export Prices
- Click "Export Prices" to download CSV
- Use as a template for bulk updates
- Contains: ProductCode, ProductName, SpecificPrice, BasePrice, etc.

#### Import Prices (Bulk Update)
1. Download current prices as template
2. Edit the CSV file:
   - Update SpecificPrice column
   - Add new rows for new products
   - Set EffectiveFrom and EffectiveTo dates
3. Upload the CSV file
4. System validates and imports prices
5. View import results (successful/failed records)

**CSV Format:**
```csv
ProductCode,ProductName,SpecificPrice,BasePrice,EffectiveFrom,EffectiveTo
TILE-001,Royal White Ceramic 30x30,10.50,15.00,2025-01-01,
TILE-002,Elite Porcelain Grey 60x60,38.00,45.00,2025-01-01,2025-12-31
```

#### Delete Specific Price
- Click "Delete" next to any price
- Customer will revert to using their price list

### 3. Viewing Customers

**Path:** Dashboard → Customers

**Features:**
- Search customers by name or code
- View customer type (RETAIL/WHOLESALE)
- See assigned price list
- Check current balance
- Click "View / Manage Prices" to manage specific pricing

### 4. Understanding the Price Waterfall

The Price Waterfall is the core pricing logic of the system. When a salesperson adds a product to an order, the system automatically determines the correct price in this exact order:

**Level 1: CONTRACT (Customer-Specific Price)**
- Highest priority
- Checked first in CustomerProductPrices table
- Example: ABC Construction gets TILE-001 for $10.50

**Level 2: PRICELIST (Customer's Assigned Price List)**
- Second priority
- Uses the customer's assigned price list (Retail or Wholesale)
- Example: Wholesale customers get TILE-001 for $12.00

**Level 3: BASE (Product's Default Price)**
- Lowest priority / Fallback
- Uses the BasePrice from Products table
- Example: TILE-001 base price is $15.00

**Visual Indicators:**
- Green badge = CONTRACT (best price for customer)
- Blue badge = PRICELIST (standard price list)
- Gray badge = BASE (default/fallback price)

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login

### Products
- `GET /api/v1/products` - List all products
- `GET /api/v1/products/:id` - Get product details
- `POST /api/v1/products` - Create product (Admin only)

### Customers
- `GET /api/v1/customers` - List all customers
- `GET /api/v1/customers/:id` - Get customer details
- `POST /api/v1/customers` - Create customer

### Customer-Specific Pricing (CRITICAL)
- `GET /api/v1/customers/:id/prices` - Get all specific prices for customer
- `POST /api/v1/customers/:id/prices` - Set a specific price
- `DELETE /api/v1/customers/:id/prices/:productId` - Delete specific price
- `POST /api/v1/customers/:id/prices/import` - Bulk import prices (CSV)
- `GET /api/v1/customers/:id/prices/export` - Export prices as CSV

### Price Calculation
- `GET /api/v1/pricing/product/:productId/customer/:customerId` - Calculate price using waterfall

### Orders
- `GET /api/v1/orders` - List all orders
- `GET /api/v1/orders/:id` - Get order details
- `POST /api/v1/orders` - Create new order
- `POST /api/v1/orders/:id/items` - Add item to order (triggers price waterfall)
- `PUT /api/v1/orders/:id/status` - Update order status

## Database Schema

### Key Tables

**CustomerProductPrices** (CRITICAL)
- Stores customer-specific negotiated prices
- Links Customer + Product + Price
- Supports effective date ranges
- Used in Level 1 of Price Waterfall

**Customers**
- Customer master data
- Links to PriceList (for Level 2 of waterfall)
- Tracks credit limits and balances

**Products**
- Product catalog
- Contains BasePrice (Level 3 of waterfall)
- Multi-unit support

**Orders & OrderItems**
- Stores PriceSource for audit trail
- Shows which level of waterfall was used

**Inventory**
- Multi-warehouse support
- Tracks owned vs. consignment stock

## Troubleshooting

### Backend not starting
```bash
# Check PostgreSQL is running
sudo service postgresql status

# Check database connection
sudo -u postgres psql -d ceramic_erp -c "SELECT COUNT(*) FROM products;"
```

### Frontend not connecting to backend
```bash
# Check .env.local file
cat frontend/.env.local

# Should contain:
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

### Price not calculating correctly
1. Check customer has a price list assigned
2. Verify product exists in database
3. Check CustomerProductPrices table for specific prices
4. Review PriceListItems for price list entries

## Next Steps

### Recommended Enhancements

1. **Authentication System**
   - Implement login page
   - Add JWT token management
   - Role-based access control

2. **Additional Modules**
   - Inventory management screens
   - Purchase orders
   - Factory settlements
   - Fleet/delivery tracking
   - Payroll
   - Reporting dashboards

3. **Mobile Apps**
   - Driver app for deliveries
   - Warehouse app for stock management

4. **Advanced Features**
   - Real-time notifications
   - Email/SMS alerts
   - Barcode scanning
   - Document generation (invoices, delivery notes)

## Support

For questions or issues:
- Check the API documentation
- Review the database schema
- Examine the Price Waterfall pseudocode
- Test with sample data

## License

This software is provided as-is for the ceramic and tiles distribution business.


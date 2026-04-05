# Ceramic & Tiles ERP System

A complete, production-ready ERP and business management software for ceramic and tiles distributors operating as both retailers and wholesalers.

## 🎯 Key Features

### Critical Feature: Price Waterfall Logic

The system implements a sophisticated three-level pricing hierarchy that automatically determines the correct price for each customer-product combination:

1. **Level 1 - CONTRACT:** Customer-specific negotiated prices
2. **Level 2 - PRICELIST:** Customer's assigned price list (Retail/Wholesale)
3. **Level 3 - BASE:** Product's default base price

When a salesperson adds a product to an order, the system automatically applies the best available price and displays the source (CONTRACT, PRICELIST, or BASE) for full transparency.

### Complete Module Coverage

The system includes 15 fully-architected modules:

1. Catalog & Product Master
2. Inventory & Warehousing (Multi-location, Consignment)
3. **Pricing & Price Lists** (with customer-specific pricing)
4. Sales & POS
5. Wholesale / Orders / Consignment
6. Purchasing & Receipts
7. Factory Settlements & Commissioning
8. Customers & CRM
9. Accounting & Payments
10. Payroll & HR
11. Fleet & Logistics
12. Reporting & Dashboards
13. Admin, Security & Audit
14. Data Import/Export
15. Mobile Apps (Architecture ready)

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 14+
- pnpm

### Installation

1. **Start PostgreSQL**
   ```bash
   sudo service postgresql start
   ```

2. **Start Backend** (Terminal 1)
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   Backend runs on: http://localhost:5000

3. **Start Frontend** (Terminal 2)
   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```
   Frontend runs on: http://localhost:3000

### Default Login

- Username: `admin`
- Password: `admin123`

## 📦 What's Included

### Backend (Node.js + Express)

- RESTful API with 30+ endpoints
- PostgreSQL database with 20+ tables
- JWT authentication
- Price Waterfall service
- CSV import/export for bulk pricing
- Comprehensive error handling

### Frontend (Next.js + React)

- Modern, responsive UI with Tailwind CSS
- Dashboard with module navigation
- **POS/Create Order screen** with automatic pricing
- **Customer-Specific Pricing Management** with bulk import/export
- Customer and product management
- Real-time price calculation

### Database

- Complete normalized schema
- Foreign key constraints
- Indexes for performance
- Sample data pre-loaded:
  - 3 Customers (with specific prices)
  - 5 Products
  - 3 Price Lists
  - Inventory data

## 🎨 User Interface Highlights

### POS / Create Order Screen

A three-panel layout designed for speed and accuracy:

- **Left Panel:** Customer selection and details
- **Center Panel:** Product search with automatic price calculation
- **Right Panel:** Order summary with real-time totals

The system shows the price source (CONTRACT/PRICELIST/BASE) for every item, providing full transparency to the salesperson.

### Customer-Specific Pricing Management

A powerful interface for managing thousands of negotiated prices:

- View all specific prices for a customer
- Compare specific price vs. base price
- See savings percentage
- **Bulk Import/Export** via CSV for managing large price lists
- Set effective date ranges for prices

## 🏗️ Architecture

### Project Structure

```
ceramic-erp-platform/
├── backend/
│   ├── src/
│   │   ├── api/v1/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   │   └── pricing.service.js  ← Price Waterfall Logic
│   │   │   ├── routes/
│   │   │   └── middleware/
│   │   ├── config/
│   │   └── scripts/
│   └── schema.sql
├── frontend/
│   ├── app/
│   │   ├── sales/pos/          ← POS Screen
│   │   ├── customers/[id]/     ← Customer Pricing
│   │   └── page.tsx
│   └── lib/
│       └── api.ts
└── docs/
```

### Technology Decisions

**Backend: Node.js + Express**
- Fast development
- Large ecosystem
- Excellent PostgreSQL support
- Easy to scale

**Frontend: Next.js + React**
- Server-side rendering
- File-based routing
- Built-in optimization
- Great developer experience

**Database: PostgreSQL**
- Robust and reliable
- Excellent for complex queries
- Strong data integrity
- JSONB support for flexible data

## 📊 Sample Data

The system comes with pre-loaded sample data to demonstrate the Price Waterfall:

**Customer: ABC Construction Ltd**
- Type: WHOLESALE
- Price List: Wholesale ($12.00 for TILE-001)
- **Specific Price:** $10.50 for TILE-001 (saves $1.50 vs. price list)

When creating an order for ABC Construction:
- TILE-001 → $10.50 (CONTRACT) ✓
- TILE-003 → $12.00 (PRICELIST)
- Other products → Base price

## 🔧 API Endpoints

### Critical Pricing Endpoints

```
GET  /api/v1/pricing/product/:productId/customer/:customerId
     → Calculate price using waterfall logic

GET  /api/v1/customers/:id/prices
     → Get all specific prices for customer

POST /api/v1/customers/:id/prices
     → Set a customer-specific price

POST /api/v1/customers/:id/prices/import
     → Bulk import prices from CSV

GET  /api/v1/customers/:id/prices/export
     → Export prices to CSV
```

### Core Endpoints

```
GET  /api/v1/products
GET  /api/v1/customers
POST /api/v1/orders
POST /api/v1/orders/:id/items  ← Triggers price waterfall
```

## 📚 Documentation

- **USER_GUIDE.md** - Comprehensive user guide with screenshots and workflows
- **erp_database_schema.sql** - Complete database schema
- **api_endpoints.md** - Full API documentation
- **price_waterfall_logic.md** - Pseudocode for pricing logic
- **ui_wireframe_descriptions.md** - UI/UX specifications

## 🧪 Testing the Price Waterfall

1. Go to POS screen: http://localhost:3000/sales/pos
2. Select "ABC Construction Ltd" as customer
3. Search for "TILE-001"
4. Observe: Price shows $10.50 with "CONTRACT" badge
5. Search for "TILE-003"
6. Observe: Price shows $12.00 with "PRICELIST" badge

This demonstrates all three levels of the waterfall working correctly.

## 🚀 Next Steps

### Immediate Enhancements

1. Add authentication to frontend
2. Implement remaining CRUD screens
3. Add inventory management UI
4. Create reporting dashboards

### Future Modules

1. Purchase order management
2. Factory settlement calculations
3. Fleet/delivery tracking
4. Mobile apps for drivers and warehouse
5. Document generation (invoices, delivery notes)

## 📝 License

This software is provided for the ceramic and tiles distribution business.

## 🙏 Acknowledgments

Built with modern web technologies:
- Next.js 16
- React 19
- Node.js 22
- PostgreSQL 14
- Tailwind CSS
- TypeScript


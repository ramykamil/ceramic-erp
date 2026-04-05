const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  const client = await pool.connect();

  try {
    console.log('Starting database seeding...');

    await client.query('BEGIN');

    // 0. Clear existing data - Only tables that exist in the schema
    console.log('Clearing existing data...');
    await client.query(`
      TRUNCATE TABLE 
        Users, Employees, Inventory, CustomerProductPrices, 
        PriceListItems, Products, Customers, Factories, 
        Warehouses, Brands, Categories
      RESTART IDENTITY CASCADE
    `);

    // 1. Create sample categories
    console.log('Creating categories...');
    const categoryResult = await client.query(`
      INSERT INTO Categories (CategoryName, Description) VALUES
      ('Ceramic Tiles', 'Various ceramic floor and wall tiles'),
      ('Porcelain Tiles', 'High-quality porcelain tiles'),
      ('Sanitary Ware', 'Bathroom fixtures and fittings')
      RETURNING CategoryID
    `);

    // 2. Create sample factory
    console.log('Creating factory...');
    await client.query(`
      INSERT INTO Factories (FactoryCode, FactoryName, ContactPerson, Phone, Email) VALUES
      ('FAC-001', 'Royal Ceramics Factory', 'John Smith', '+1234567890', 'john@royalceramics.com')
      RETURNING FactoryID
    `);

    // 3. Create sample brands (NO FactoryID column in Brands table)
    console.log('Creating brands...');
    await client.query(`
      INSERT INTO Brands (BrandName, Description) VALUES
      ('Royal Ceramics', 'Premium ceramic tile manufacturer'),
      ('Elite Porcelain', 'Luxury porcelain products'),
      ('Modern Sanitary', 'Contemporary bathroom solutions')
    `);

    // 4. Create sample warehouse
    console.log('Creating warehouse...');
    const warehouseResult = await client.query(`
      INSERT INTO Warehouses (WarehouseCode, WarehouseName, Location, Address) VALUES
      ('WH-001', 'Main Warehouse', 'Downtown', '123 Main Street')
      RETURNING WarehouseID
    `);

    // Get the created IDs
    const categoryIds = categoryResult.rows.map(r => r.categoryid);

    const brandResult = await client.query('SELECT BrandID FROM Brands ORDER BY BrandID');
    const brandIds = brandResult.rows.map(r => r.brandid);

    const unitResult = await client.query('SELECT UnitID FROM Units WHERE UnitCode = \'PCS\'');
    const unitId = unitResult.rows[0]?.unitid;

    if (!unitId) {
      throw new Error('Unit PCS not found. Please run the schema.sql first to create base units.');
    }

    // 5. Create sample products
    console.log('Creating products...');
    const productResult = await client.query(`
      INSERT INTO Products (ProductCode, ProductName, CategoryID, BrandID, PrimaryUnitID, BasePrice, Description) VALUES
      ('TILE-001', 'Royal White Ceramic 30x30', $1, $2, $3, 15.00, 'Premium white ceramic tile'),
      ('TILE-002', 'Elite Porcelain Grey 60x60', $4, $5, $3, 45.00, 'Large format grey porcelain'),
      ('SINK-001', 'Modern Basin White', $6, $7, $3, 150.00, 'Contemporary white basin'),
      ('TILE-003', 'Royal Beige Ceramic 40x40', $1, $2, $3, 20.00, 'Beige ceramic floor tile'),
      ('TILE-004', 'Elite Black Porcelain 30x60', $4, $5, $3, 35.00, 'Black porcelain wall tile')
      RETURNING ProductID
    `, [categoryIds[0], brandIds[0], unitId, categoryIds[1], brandIds[1], categoryIds[2], brandIds[2]]);

    // Get price list IDs
    const priceListResult = await client.query('SELECT PriceListID, PriceListCode FROM PriceLists ORDER BY PriceListID');

    if (priceListResult.rows.length === 0) {
      throw new Error('No price lists found. Please run the schema.sql first to create base price lists.');
    }

    const retailPriceListId = priceListResult.rows.find(r => r.pricelistcode === 'RETAIL')?.pricelistid;
    const wholesalePriceListId = priceListResult.rows.find(r => r.pricelistcode === 'WHOLESALE')?.pricelistid;

    if (!retailPriceListId || !wholesalePriceListId) {
      console.log('Warning: RETAIL or WHOLESALE price lists not found, using first available');
    }

    const safePriceListId = retailPriceListId || wholesalePriceListId || priceListResult.rows[0].pricelistid;

    // 6. Create sample customers
    console.log('Creating customers...');
    const customerResult = await client.query(`
      INSERT INTO Customers (CustomerCode, CustomerName, CustomerType, PriceListID, Phone, Email, CreditLimit) VALUES
      ('CUST-001', 'ABC Construction Ltd', 'WHOLESALE', $1, '+1234567890', 'abc@construction.com', 50000.00),
      ('CUST-002', 'XYZ Retail Store', 'RETAIL', $2, '+0987654321', 'xyz@retail.com', 10000.00),
      ('CUST-003', 'BuildRight Contractors', 'WHOLESALE', $1, '+1122334455', 'info@buildright.com', 75000.00)
      RETURNING CustomerID
    `, [wholesalePriceListId || safePriceListId, retailPriceListId || safePriceListId]);

    // 7. Create admin employee
    console.log('Creating employee...');
    const employeeResult = await client.query(`
      INSERT INTO Employees (EmployeeCode, FirstName, LastName, Position, Department, Email, BasicSalary) VALUES
      ('EMP-001', 'Admin', 'User', 'System Administrator', 'IT', 'admin@ceramicerp.com', 5000.00)
      RETURNING EmployeeID
    `);

    // 8. Create admin user
    console.log('Creating admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO Users (Username, PasswordHash, Email, EmployeeID, Role) VALUES
      ('admin', $1, 'admin@ceramicerp.com', $2, 'ADMIN')
      ON CONFLICT (Username) DO NOTHING
    `, [hashedPassword, employeeResult.rows[0].employeeid]);

    // 8.1 Create Retail User
    console.log('Creating retail user...');
    const retailPassword = await bcrypt.hash('retail123', 10);
    await client.query(`
      INSERT INTO Users (Username, PasswordHash, Email, Role) VALUES
      ('retail', $1, 'retail@ceramicerp.com', 'SALES_RETAIL')
      ON CONFLICT (Username) DO NOTHING
    `, [retailPassword]);

    // 8.2 Create Wholesale User
    console.log('Creating wholesale user...');
    const wholesalePassword = await bcrypt.hash('wholesale123', 10);
    await client.query(`
      INSERT INTO Users (Username, PasswordHash, Email, Role) VALUES
      ('wholesale', $1, 'wholesale@ceramicerp.com', 'SALES_WHOLESALE')
      ON CONFLICT (Username) DO NOTHING
    `, [wholesalePassword]);

    // Get product IDs
    const productIds = productResult.rows.map(r => r.productid);
    const customerIds = customerResult.rows.map(r => r.customerid);
    const warehouseId = warehouseResult.rows[0].warehouseid;

    // 9. Add products to price lists (if price lists exist)
    if (retailPriceListId && wholesalePriceListId) {
      console.log('Adding products to price lists...');
      await client.query(`
        INSERT INTO PriceListItems (PriceListID, ProductID, Price) VALUES
        ($1, $2, 18.00),
        ($1, $3, 55.00),
        ($1, $4, 180.00),
        ($5, $2, 12.00),
        ($5, $3, 40.00),
        ($5, $4, 135.00)
        ON CONFLICT DO NOTHING
      `, [retailPriceListId, productIds[0], productIds[1], productIds[2], wholesalePriceListId]);
    }

    // 10. Add customer-specific prices
    console.log('Adding customer-specific prices...');
    await client.query(`
      INSERT INTO CustomerProductPrices (CustomerID, ProductID, SpecificPrice, Notes) VALUES
      ($1, $2, 10.50, 'Special negotiated price for ABC Construction'),
      ($1, $3, 38.00, 'Volume discount for ABC Construction'),
      ($4, $2, 11.00, 'Contract price for BuildRight')
      ON CONFLICT DO NOTHING
    `, [customerIds[0], productIds[0], productIds[1], customerIds[2]]);

    // 11. Add inventory
    console.log('Adding inventory...');
    await client.query(`
      INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand) VALUES
      ($1, $2, 'OWNED', 5000.00),
      ($3, $2, 'OWNED', 2000.00),
      ($4, $2, 'OWNED', 150.00),
      ($5, $2, 'OWNED', 3000.00),
      ($6, $2, 'OWNED', 1500.00)
      ON CONFLICT DO NOTHING
    `, [productIds[0], warehouseId, productIds[1], productIds[2], productIds[3], productIds[4]]);

    await client.query('COMMIT');

    console.log('✓ Database seeding completed successfully!');
    console.log('\nSample Data Created:');
    console.log('- 3 Categories');
    console.log('- 3 Brands');
    console.log('- 5 Products');
    console.log('- 3 Customers');
    console.log('- 1 Admin User (username: admin, password: admin123)');
    console.log('- 1 Retail User (username: retail, password: retail123)');
    console.log('- 1 Wholesale User (username: wholesale, password: wholesale123)');
    console.log('- Price lists with retail and wholesale prices');
    console.log('- Customer-specific negotiated prices');
    console.log('- Initial inventory');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run seeding
seedDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

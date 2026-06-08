const pool = require('../config/database');

const tables = [
  'Categories', 'Brands', 'Units', 'Products', 'ProductUnits', 'Warehouses',
  'Factories', 'Inventory', 'InventoryTransactions', 'PriceLists', 'PriceListItems',
  'BuyingPrices', 'Customers', 'CustomerProductPrices', 'Orders', 'OrderItems',
  'Invoices', 'PurchaseOrders', 'PurchaseOrderItems', 'GoodsReceipts', 'GoodsReceiptItems',
  'FactorySettlements', 'SettlementItems', 'CustomerContacts', 'CustomerInteractions',
  'Payments', 'PaymentAllocations', 'AccountingEntries', 'Employees', 'Attendance',
  'PayrollPeriods', 'Payroll', 'Vehicles', 'Drivers', 'Deliveries', 'VehicleMaintenances',
  'Users', 'ActiveSessions', 'AppSettings'
];

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting Multi-Tenancy database migration...');
    await client.query('BEGIN');

    // 1. Create Tenants Table
    console.log('Creating Tenants table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS Tenants (
        TenantID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        StoreName TEXT NOT NULL,
        DomainPrefix TEXT UNIQUE NOT NULL,
        PlanType TEXT NOT NULL DEFAULT 'TRIAL' CHECK (PlanType IN ('TRIAL', 'BASIC', 'PREMIUM')),
        TrialStartDate TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        TrialEndDate TIMESTAMPTZ NOT NULL,
        SubscriptionStatus TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (SubscriptionStatus IN ('ACTIVE', 'EXPIRED', 'SUSPENDED')),
        CreatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create Default Tenant
    const defaultTenantId = 'd0000000-0000-0000-0000-000000000000';
    console.log(`Checking if default tenant exists (${defaultTenantId})...`);
    const tenantCheck = await client.query('SELECT TenantID FROM Tenants WHERE TenantID = $1', [defaultTenantId]);
    if (tenantCheck.rows.length === 0) {
      console.log('Creating default tenant...');
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 20); // 20 days trial
      await client.query(`
        INSERT INTO Tenants (TenantID, StoreName, DomainPrefix, PlanType, TrialEndDate, SubscriptionStatus)
        VALUES ($1, 'Boutique Par Défaut', 'default', 'TRIAL', $2, 'ACTIVE')
      `, [defaultTenantId, trialEndDate]);
    }

    // 3. Update existing tables
    for (const table of tables) {
      console.log(`Checking table ${table}...`);
      
      // Check if table exists (case-sensitive check)
      const tableExistsCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND lower(table_name) = lower($1)
        );
      `, [table]);

      if (!tableExistsCheck.rows[0].exists) {
        console.log(`Table ${table} does not exist in database, skipping.`);
        continue;
      }

      // Check if TenantID column already exists
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND lower(table_name) = lower($1) 
          AND lower(column_name) = 'tenantid';
      `, [table]);

      const realTableNameQuery = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND lower(table_name) = lower($1)
      `, [table]);
      const realTableName = realTableNameQuery.rows[0].table_name;

      if (columnCheck.rows.length === 0) {
        console.log(`Adding TenantID to ${realTableName}...`);
        
        // Add column
        await client.query(`
          ALTER TABLE "${realTableName}" 
          ADD COLUMN TenantID UUID REFERENCES Tenants(TenantID) ON DELETE CASCADE;
        `);

        // Populate with default tenant ID
        await client.query(`
          UPDATE "${realTableName}" 
          SET TenantID = $1 
          WHERE TenantID IS NULL;
        `, [defaultTenantId]);

        // Make it NOT NULL
        await client.query(`
          ALTER TABLE "${realTableName}" 
          ALTER COLUMN TenantID SET NOT NULL;
        `);

        // Create index
        await client.query(`
          CREATE INDEX IF NOT EXISTS "idx_${realTableName.toLowerCase()}_tenant_id" 
          ON "${realTableName}" (TenantID);
        `);
      } else {
        console.log(`TenantID already exists on ${realTableName}.`);
      }
    }

    await client.query('COMMIT');
    console.log('Multi-Tenancy migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();

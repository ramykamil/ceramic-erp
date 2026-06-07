const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log('Starting full database reset...');
    await client.query('BEGIN');

    // Set replica mode to ignore foreign key constraints during truncation
    await client.query("SET session_replication_role = 'replica';");

    const tablesToWipe = [
      'deliveries',
      'returns',
      'returnitems',
      'orderitems',
      'orders',
      'invoices',
      'goodsreceiptitems',
      'goodsreceipts',
      'purchaseorderitems',
      'purchaseorders',
      'settlementitems',
      'factorysettlements',
      'inventorytransactions',
      'inventory',
      'buyingprices',
      'customerproductprices',
      'pricelistitems',
      'productunits',
      'products',
      'categories',
      'brands',
      'factories',
      'customercontacts',
      'customerinteractions',
      'payments',
      'paymentallocations',
      'accountingentries',
      'attendance',
      'payroll',
      'payrollperiods',
      'vehiclemaintenances',
      'drivers',
      'vehicles',
      'employees',
      'importjobs',
      'activesessions',
      'auditlogs'
    ];

    for (const table of tablesToWipe) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE;`);
        console.log(`✓ Table "${table}" truncated.`);
      } catch (err) {
        // Table might not exist in this database version, skip
        console.log(`⚠ Table "${table}" skipped (might not exist or failed: ${err.message})`);
      }
    }

    // Reset sequences
    const sequences = [
      'orders_seq',
      'po_seq',
      'gr_seq',
      'returns_seq'
    ];
    for (const seq of sequences) {
      try {
        await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1;`);
        console.log(`✓ Sequence "${seq}" restarted.`);
      } catch (err) {
        console.log(`⚠ Sequence "${seq}" skipped (might not exist)`);
      }
    }

    // Re-enable trigger replication
    await client.query("SET session_replication_role = 'origin';");

    await client.query('COMMIT');
    console.log('Database reset completed successfully! Preserved default user accounts, settings, units, and warehouses.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error resetting database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase();

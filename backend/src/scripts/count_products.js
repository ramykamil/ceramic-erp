const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require('../config/database');

async function countProducts() {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM "products"');
    console.log('Count from "products" (lowercase):', res.rows[0].count);
  } catch (err) {
    console.error('Error on "products" (lowercase):', err.message);
  }

  try {
    const res = await pool.query('SELECT COUNT(*) FROM "Products"');
    console.log('Count from "Products" (camelcase):', res.rows[0].count);
  } catch (err) {
    console.error('Error on "Products" (camelcase):', err.message);
  }
  
  await pool.end();
}

countProducts();

const { Pool } = require('pg');
const path = require('path');
// Removed dotenv to prevent environment variable interference

const pool = new Pool({
    connectionString: "postgres://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

console.log('Pool configured with connection string. Target user:', 'postgres.ugvioyruqoafvsqvnwiy');

const parseSqmPerPiece = (str) => {
  if (!str) return 0;
  const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
  if (match) {
    return (parseInt(match[1]) * parseInt(match[2])) / 10000;
  }
  return 0;
};

const convertUnitToInventory = (qty, cartUnitCode, primaryUnitCode, sqmPerPiece, qteParColis = 0, cartonsPerPalette = 0) => {
  const q = parseFloat(qty) || 0;
  if (!cartUnitCode || !primaryUnitCode || cartUnitCode === primaryUnitCode) return q;

  let piecesQty = q;
  if (cartUnitCode === 'SQM' && sqmPerPiece > 0) {
    piecesQty = q / sqmPerPiece;
  } else if (cartUnitCode === 'CARTON' || cartUnitCode === 'CRT' || cartUnitCode === 'COLIS') {
    piecesQty = qteParColis > 0 ? q * qteParColis : q;
  } else if (cartUnitCode === 'PALETTE' || cartUnitCode === 'PAL') {
    piecesQty = q * (qteParColis || 1) * (cartonsPerPalette || 1);
  }

  if (primaryUnitCode === 'SQM') {
    if ((cartUnitCode === 'CARTON' || cartUnitCode === 'CRT' || cartUnitCode === 'COLIS') && qteParColis > 0 && sqmPerPiece > 0) {
      const isMultiple = Math.abs(qteParColis / sqmPerPiece - Math.round(qteParColis / sqmPerPiece)) < 0.01;
      if (!isMultiple) return q * qteParColis;
    }
    return sqmPerPiece > 0 ? piecesQty * sqmPerPiece : piecesQty;
  }
  
  if (primaryUnitCode === 'CARTON' || primaryUnitCode === 'CRT' || primaryUnitCode === 'COLIS') {
    return qteParColis > 0 ? piecesQty / qteParColis : piecesQty;
  }
  return piecesQty;
};

async function reconcile() {
  const client = await pool.connect();
  try {
    console.log('Starting Inventory Reservation Reconciliation...');
    await client.query('BEGIN');

    // 1. Reset all QuantityReserved for OWNED stock to 0
    console.log('Resetting all QuantityReserved to 0...');
    await client.query("UPDATE Inventory SET QuantityReserved = 0 WHERE OwnershipType = 'OWNED' AND FactoryID IS NULL");

    // 2. Fetch all OrderItems for PENDING orders
    console.log('Fetching all PENDING order items...');
    const itemsRes = await client.query(`
      SELECT 
        oi.ProductID, 
        oi.Quantity, 
        u.UnitCode,
        o.WarehouseID,
        p.ProductName,
        p.Size,
        p.QteParColis,
        p.QteColisParPalette,
        pu_p.UnitCode as PrimaryUnitCode
      FROM OrderItems oi
      JOIN Orders o ON oi.OrderID = o.OrderID
      JOIN Products p ON oi.ProductID = p.ProductID
      LEFT JOIN Units u ON oi.UnitID = u.UnitID
      LEFT JOIN Units pu_p ON p.PrimaryUnitID = pu_p.UnitID
      WHERE o.Status = 'PENDING'
    `);

    console.log(`Found ${itemsRes.rows.length} items to process.`);

    const reservations = {}; // { productID_warehouseID: totalQuantity }

    for (const item of itemsRes.rows) {
      const sqmPerPiece = parseSqmPerPiece(item.size || item.ProductName);
      const convertedQty = convertUnitToInventory(
        item.Quantity,
        item.UnitCode,
        item.PrimaryUnitCode,
        sqmPerPiece,
        parseFloat(item.QteParColis) || 0,
        parseFloat(item.QteColisParPalette) || 0
      );

      const key = `${item.productid}_${item.warehouseid || 1}`;
      reservations[key] = (reservations[key] || 0) + convertedQty;
    }

    // 3. Update Inventory with new totals
    console.log('Updating Inventory table...');
    for (const [key, qty] of Object.entries(reservations)) {
      const [productId, warehouseId] = key.split('_');
      await client.query(`
        UPDATE Inventory 
        SET QuantityReserved = $1 
        WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED' AND FactoryID IS NULL
      `, [qty, productId, warehouseId]);
    }

    await client.query('COMMIT');
    console.log('Reconciliation completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reconciliation failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

reconcile();

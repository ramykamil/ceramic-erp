require('dotenv').config();
const pool = require('./src/config/database');

async function fixReserved() {
    const client = await pool.connect();
    try {
        console.log('Starting Reserved Stock Recalculation...');
        await client.query('BEGIN');

        // 1. Reset all QuantityReserved to 0
        await client.query(`
      UPDATE Inventory 
      SET QuantityReserved = 0
      WHERE OwnershipType = 'OWNED'
    `);
        console.log('Reset all QuantityReserved to 0.');

        // 2. Helper to get sqmPerPiece
        const parseSqmPerPiece = (str) => {
            if (!str) return 0;
            const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
            if (match) {
                return (parseInt(match[1]) * parseInt(match[2])) / 10000;
            }
            return 0;
        };

        // 3. Helper to convert unit to inventory (same logic as controller)
        const convertUnitToInventory = (qty, cartUnitCode, primaryUnitCode, sqmPerPiece, productName) => {
            let finalQty = parseFloat(qty) || 0;
            const isFicheProduct = (productName || '').toLowerCase().startsWith('fiche');
            if (isFicheProduct || sqmPerPiece <= 0) return finalQty;

            const isCartPcs = (cartUnitCode === 'PCS' || cartUnitCode === 'PIECE');
            const isCartSqm = (cartUnitCode === 'SQM' || cartUnitCode === 'M2');

            const isPrimaryPcs = (primaryUnitCode === 'PCS' || primaryUnitCode === 'PIECE' || !primaryUnitCode);
            const isPrimarySqm = (primaryUnitCode === 'SQM' || primaryUnitCode === 'M2');

            if (isCartSqm && isPrimaryPcs) {
                return finalQty / sqmPerPiece;
            }
            else if (isCartPcs && isPrimarySqm) {
                return finalQty * sqmPerPiece;
            }

            return finalQty;
        };

        // 4. Calculate total reserved quantity per product from PENDING orders
        const pendingItemsRes = await client.query(`
      SELECT 
        oi.ProductID, 
        oi.Quantity, 
        u.UnitCode,
        p.ProductName, 
        p.Size, 
        p.PrimaryUnitID, 
        pu_p.UnitCode as PrimaryUnitCode,
        o.WarehouseID
      FROM OrderItems oi
      JOIN Orders o ON oi.OrderID = o.OrderID
      JOIN Products p ON oi.ProductID = p.ProductID
      LEFT JOIN Units u ON oi.UnitID = u.UnitID
      LEFT JOIN Units pu_p ON p.PrimaryUnitID = pu_p.UnitID
      WHERE o.Status = 'PENDING'
    `);

        console.log(`Found ${pendingItemsRes.rows.length} items in PENDING orders.`);

        // Group by ProductID and WarehouseID
        const reservedTotals = {};

        for (const item of pendingItemsRes.rows) {
            const qty = parseFloat(item.quantity) || 0;
            const sqmPerPiece = parseSqmPerPiece(item.size || item.productname);

            // Call conversion logic identical to the Order Controller
            const qtyToReserve = convertUnitToInventory(qty, item.unitcode, item.primaryunitcode, sqmPerPiece, item.productname);

            const warehouseId = item.warehouseid || 1;
            const key = `${item.productid}_${warehouseId}`;

            if (!reservedTotals[key]) {
                reservedTotals[key] = {
                    productId: item.productid,
                    warehouseId: warehouseId,
                    totalReserved: 0
                };
            }
            reservedTotals[key].totalReserved += qtyToReserve;
        }

        // 5. Update Inventory with correct QuantityReserved
        let updatedCount = 0;
        for (const key in reservedTotals) {
            const { productId, warehouseId, totalReserved } = reservedTotals[key];

            const updateRes = await client.query(`
        UPDATE Inventory 
        SET QuantityReserved = $1
        WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
      `, [totalReserved, productId, warehouseId]);

            if (updateRes.rowCount > 0) {
                updatedCount++;
            }
        }

        console.log(`Updated QuantityReserved for ${updatedCount} inventory records.`);

        await client.query('COMMIT');
        console.log('✅ Reserved stock Recalculation Completed successfully.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error fixing reserved stock:', error);
    } finally {
        client.release();
        pool.end();
    }
}

fixReserved();

const pool = require('../backend/src/config/database');
const { convertToStockUnit } = require('../backend/src/api/v1/utils/unitConverter');

async function repair() {
    console.log('--- Starting Inventory Repair ---');
    const client = await pool.connect();
    try {
        const invRes = await client.query(`
            SELECT i.ProductID, i.WarehouseID, i.QuantityOnHand, p.ProductName, p.ProductCode, 
                   p.Size, u.UnitCode as primaryunitcode, p.QteParColis as qteparcolis, p.QteColisParPalette as qtecolisparpalette
            FROM Inventory i
            JOIN Products p ON i.ProductID = p.ProductID
            LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
            WHERE i.OwnershipType = 'OWNED' AND i.FactoryID IS NULL
        `);

        console.log(`Analyzing ${invRes.rows.length} inventory records...`);

        for (const row of invRes.rows) {
            try {
                const { productid, warehouseid, productname } = row;

                // a. Sum from POs
                const poRes = await client.query(`
                    SELECT poi.ReceivedQuantity as quantity, u.UnitCode as unitcode
                    FROM PurchaseOrderItems poi
                    JOIN PurchaseOrders po ON poi.PurchaseOrderID = po.PurchaseOrderID
                    JOIN Units u ON poi.UnitID = u.UnitID
                    WHERE poi.ProductID = $1 AND po.WarehouseID = $2
                      AND po.Status IN ('RECEIVED', 'PARTIAL')
                `, [productid, warehouseid]);

                let totalIn = 0;
                for (const item of poRes.rows) {
                    totalIn += convertToStockUnit(item.quantity, item.unitcode, row);
                }

                // b. Sum from Sales
                const saleRes = await client.query(`
                    SELECT oi.Quantity as quantity, u.UnitCode as unitcode
                    FROM OrderItems oi
                    JOIN Orders o ON oi.OrderID = o.OrderID
                    JOIN Units u ON oi.UnitID = u.UnitID
                    WHERE oi.ProductID = $1 AND o.WarehouseID = $2
                      AND o.Status IN ('COMPLETED', 'DELIVERED', 'PAID', 'PARTIAL')
                `, [productid, warehouseid]);

                let totalOut = 0;
                for (const item of saleRes.rows) {
                    totalOut += convertToStockUnit(item.quantity, item.unitcode, row);
                }

                // c. Adjustments
                const adjRes = await client.query(`
                    SELECT Quantity as quantity
                    FROM InventoryTransactions
                    WHERE ProductID = $1 AND WarehouseID = $2
                      AND TransactionType = 'ADJUSTMENT'
                      AND OwnershipType = 'OWNED' AND FactoryID IS NULL
                `, [productid, warehouseid]);

                let totalAdj = 0;
                for (const item of adjRes.rows) {
                    totalAdj += parseFloat(item.quantity);
                }

                const calculatedQty = totalIn - totalOut + totalAdj;
                const currentQty = parseFloat(row.quantityonhand);

                if (Math.abs(calculatedQty - currentQty) > 0.01) {
                    console.log(`[DISCREPANCY] Product: ${productname} | Current: ${currentQty.toFixed(2)} | Calculated: ${calculatedQty.toFixed(2)}`);

                    // Start small transaction for this product
                    await client.query('BEGIN');
                    await client.query(`
                        UPDATE Inventory SET 
                            QuantityOnHand = $1,
                            UpdatedAt = CURRENT_TIMESTAMP
                        WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED' AND FactoryID IS NULL
                    `, [calculatedQty, productid, warehouseid]);

                    const ppc = parseFloat(row.qteparcolis) || 0;
                    const cpp = parseFloat(row.qtecolisparpalette) || 0;
                    const newColis = ppc > 0 ? parseFloat((calculatedQty / ppc).toFixed(4)) : 0;
                    const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
                    await client.query(`
                        UPDATE Inventory SET ColisCount = $1, PalletCount = $2
                        WHERE ProductID = $3 AND WarehouseID = $4 AND OwnershipType = 'OWNED' AND FactoryID IS NULL
                    `, [newColis, newPallets, productid, warehouseid]);
                    await client.query('COMMIT');
                    console.log(`   -> FIXED ${productname}`);
                }
            } catch (productError) {
                console.error(`Failed to process product ${row.productname}:`, productError.message);
                if (client) await client.query('ROLLBACK').catch(() => {});
            }
        }

        console.log('--- Repair Finished ---');
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');

    } catch (err) {
        console.error('Repair failed:', err.message);
    } finally {
        client.release();
        process.exit();
    }
}

repair();

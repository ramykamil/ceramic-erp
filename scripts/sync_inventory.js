const pool = require('../backend/src/config/database');

// Configuration
const START_DATE = '2026-04-06';
const DRY_RUN = false; 

async function syncInventory() {
    console.log(`[Sync] Starting filtered inventory synchronization...`);
    console.log(`[Sync] Start Date: ${START_DATE} | Dry Run: ${DRY_RUN}`);
    
    const client = await pool.connect();
    
    try {
        // 1. Find CONFIRMED orders starting from START_DATE with NO 'OUT' transactions
        const ordersResult = await client.query(`
            SELECT o.OrderID, o.OrderNumber, o.WarehouseID, o.Status, o.CreatedBy, o.OrderDate
            FROM Orders o
            LEFT JOIN InventoryTransactions it ON o.OrderID = it.ReferenceID 
                 AND it.ReferenceType = 'ORDER' 
                 AND it.TransactionType = 'OUT'
            WHERE o.Status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
              AND o.OrderDate >= $1
              AND it.TransactionID IS NULL
            ORDER BY o.OrderDate ASC
        `, [START_DATE]);

        console.log(`[Sync] Found ${ordersResult.rows.length} orders missing inventory deductions since ${START_DATE}.`);

        for (const order of ordersResult.rows) {
            console.log(`[Sync] Processing Order #${order.ordernumber} from ${order.orderdate}...`);
            
            if (DRY_RUN) continue;

            await client.query('BEGIN');
            try {
                // Fetch items for this order
                const itemsResult = await client.query(`
                    SELECT 
                        oi.ProductID, oi.Quantity, u.UnitCode,
                        p.ProductName, p.ProductCode, p.Size, p.QteParColis,
                        pu.UnitCode as PrimaryUnitCode
                    FROM OrderItems oi
                    JOIN Products p ON oi.ProductID = p.ProductID
                    LEFT JOIN Units u ON oi.UnitID = u.UnitID
                    LEFT JOIN Units pu ON p.PrimaryUnitID = pu.UnitID
                    WHERE oi.OrderID = $1
                `, [order.orderid]);

                const warehouseId = order.warehouseid || 1;

                for (const item of itemsResult.rows) {
                    // Skip service items
                    const name = (item.productname || '').toLowerCase();
                    if (name.includes('transport') || name.includes('fiche')) continue;

                    // Convert units
                    let qtyToDeduct = parseFloat(item.quantity);
                    const sqmPerPiece = parseSqmPerPiece(item.size || item.productname);
                    
                    const isCartSqm = (item.unitcode === 'SQM' || item.unitcode === 'M2');
                    const isPrimaryPcs = (item.primaryunitcode === 'PCS' || item.primaryunitcode === 'PIECE' || !item.primaryunitcode);
                    const isCartPcs = (item.unitcode === 'PCS' || item.unitcode === 'PIECE');
                    const isPrimarySqm = (item.primaryunitcode === 'SQM' || item.primaryunitcode === 'M2');

                    if (isCartSqm && isPrimaryPcs && sqmPerPiece > 0) {
                        qtyToDeduct = qtyToDeduct / sqmPerPiece;
                    } else if (isCartPcs && isPrimarySqm && sqmPerPiece > 0) {
                        qtyToDeduct = qtyToDeduct * sqmPerPiece;
                    }

                    // Deduct stock with safety
                    const deductResult = await client.query(`
                        UPDATE Inventory 
                        SET QuantityOnHand = GREATEST(0, QuantityOnHand - $1),
                            QuantityReserved = GREATEST(0, QuantityReserved - $1),
                            UpdatedAt = CURRENT_TIMESTAMP
                        WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
                        RETURNING QuantityOnHand
                    `, [qtyToDeduct, item.productid, warehouseId]);

                    // Recalculate counts
                    if (deductResult.rows.length > 0) {
                        const newQty = parseFloat(deductResult.rows[0].quantityonhand);
                        const ppc = parseFloat(item.qteparcolis) || 0;
                        const productPkg = await client.query('SELECT QteColisParPalette FROM Products WHERE ProductID = $1', [item.productid]);
                        const cpp = productPkg.rows.length > 0 ? parseFloat(productPkg.rows[0].qtecolisparpalette) || 0 : 0;
                        
                        const newColis = ppc > 0 ? parseFloat((newQty / ppc).toFixed(4)) : 0;
                        const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
                        
                        await client.query(`
                            UPDATE Inventory SET ColisCount = $1, PalletCount = $2 
                            WHERE ProductID = $3 AND WarehouseID = $4 AND OwnershipType = 'OWNED'
                        `, [newColis, newPallets, item.productid, warehouseId]);
                    }

                    // Audit Transaction
                    await client.query(`
                        INSERT INTO InventoryTransactions 
                        (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes, CreatedBy, CreatedAt)
                        VALUES ($1, $2, 'OUT', $3, 'ORDER', $4, $5, $6, CURRENT_TIMESTAMP)
                    `, [item.productid, warehouseId, qtyToDeduct, order.orderid, `Sync Filtered Vente ${order.ordernumber}`, order.createdby || 1]);
                }

                await client.query('COMMIT');
                console.log(`[Sync] Successfully synced Order #${order.ordernumber}.`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[Sync] Failed to sync Order #${order.ordernumber}:`, err.message);
            }
        }

        console.log(`[Sync] Refreshing materialized view...`);
        await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log(`[Sync] Process complete.`);
        
    } catch (error) {
        console.error('[Sync] Fatal error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

function parseSqmPerPiece(str) {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
    if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    }
    return 0;
}

syncInventory();

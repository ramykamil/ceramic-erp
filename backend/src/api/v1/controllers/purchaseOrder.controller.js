const pool = require('../../../config/database');
const accountingService = require('../services/accounting.service');

/**
 * Get all Purchase Orders
 */
async function getPurchaseOrders(req, res, next) {
    try {
        const { page = 1, limit = 50, status, factoryId, brandId } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                po.PurchaseOrderID,
                po.PONumber,
                COALESCE(f.FactoryName, b.BrandName, 
                    (SELECT br.BrandName FROM PurchaseOrderItems poi 
                     JOIN Products p ON poi.ProductID = p.ProductID 
                     LEFT JOIN Brands br ON p.BrandID = br.BrandID 
                     WHERE poi.PurchaseOrderID = po.PurchaseOrderID LIMIT 1)
                ) as FactoryName,
                w.WarehouseName,
                po.OrderDate,
                po.ExpectedDeliveryDate,
                po.Status,
                po.TotalAmount,
                po.OwnershipType,
                u.Username as CreatedByName,
                COALESCE(payments.amountpaid, 0) as AmountPaid
            FROM PurchaseOrders po
            LEFT JOIN Factories f ON po.FactoryID = f.FactoryID
            LEFT JOIN Brands b ON po.BrandID = b.BrandID
            LEFT JOIN Warehouses w ON po.WarehouseID = w.WarehouseID
            LEFT JOIN Users u ON po.CreatedBy = u.UserID
            LEFT JOIN (
                SELECT 
                    ReferenceID as PurchaseOrderID, 
                    SUM(CASE 
                        WHEN TransactionType IN ('ACHAT', 'PAIEMENT') THEN Amount 
                        WHEN TransactionType = 'RETOUR_ACHAT' THEN -Amount 
                        ELSE 0 
                    END) as amountpaid
                FROM CashTransactions
                WHERE TransactionType IN ('ACHAT', 'PAIEMENT', 'RETOUR_ACHAT')
                  AND ReferenceType = 'PURCHASE'
                GROUP BY ReferenceID
            ) payments ON po.PurchaseOrderID = payments.PurchaseOrderID
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND po.Status = $${paramIndex++}`;
            params.push(status);
        }
        if (factoryId) {
            query += ` AND po.FactoryID = $${paramIndex++}`;
            params.push(factoryId);
        }
        if (brandId) {
            query += ` AND po.BrandID = $${paramIndex++}`;
            params.push(brandId);
        }
        // Support filtering by Creator (Buyer)
        if (req.query.userId) {
            query += ` AND po.CreatedBy = $${paramIndex++}`;
            params.push(req.query.userId);
        }

        query += ` ORDER BY po.PurchaseOrderID DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        // TODO: Add total count query for pagination

        res.json({ success: true, data: result.rows });
    } catch (error) {
        next(error);
    }
}

/**
 * Get a single Purchase Order by ID (with items)
 */
async function getPurchaseOrderById(req, res, next) {
    try {
        const { id } = req.params;

        // PO Header Query - Join with both Factories and Brands for supplier name
        const poQuery = `
            SELECT po.*, 
                   po.DeliveryCost, -- Ensure DeliveryCost is explicitly selected (though po.* covers it)
                   COALESCE(f.FactoryName, b.BrandName, 'Non spécifié') AS FactoryName, 
                   w.WarehouseName
            FROM PurchaseOrders po
            LEFT JOIN Factories f ON po.FactoryID = f.FactoryID
            LEFT JOIN Brands b ON po.BrandID = b.BrandID
            LEFT JOIN Warehouses w ON po.WarehouseID = w.WarehouseID
            WHERE po.PurchaseOrderID = $1
        `;
        // PO Items Query - Include brand and packaging info from product
        const itemsQuery = `
            SELECT
                poi.*,
                p.ProductCode,
                p.ProductName,
                p.QteParColis,
                p.QteColisParPalette,
                u.UnitCode,
                b.BrandName
            FROM PurchaseOrderItems poi
            JOIN Products p ON poi.ProductID = p.ProductID
            JOIN Units u ON poi.UnitID = u.UnitID
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            WHERE poi.PurchaseOrderID = $1
            ORDER BY poi.POItemID
        `;

        const [poResult, itemsResult] = await Promise.all([
            pool.query(poQuery, [id]),
            pool.query(itemsQuery, [id])
        ]);

        if (poResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Bon de commande non trouvé' });
        }

        const po = poResult.rows[0];
        po.items = itemsResult.rows; // Attach items to the PO object

        res.json({ success: true, data: po });
    } catch (error) {
        next(error);
    }
}

/**
 * Create a new Purchase Order (with items)
 */
async function createPurchaseOrder(req, res, next) {
    const {
        factoryId,  // legacy support
        supplierId, // new: actual ID
        supplierType, // new: 'BRAND' or 'FACTORY'
        warehouseId,
        orderDate,
        expectedDeliveryDate,
        ownershipType, // 'OWNED' or 'CONSIGNMENT'
        notes,
        items // Array of item objects: [{ productId, quantity, unitId, unitPrice }, ...]
    } = req.body;
    const userId = req.user.userId;

    // Resolve the actual factory ID
    // If supplierType is BRAND, we need to find or create a factory for this brand
    // For now, we'll store the SupplierType and SupplierId in the PO notes or a new field
    // Simplest approach: Use Factories table for all suppliers, or allow FactoryID to be null if using Brand

    // For backwards compatibility and simplicity, we'll use factoryId if provided, otherwise supplierId
    let resolvedFactoryId = factoryId;

    // If new format is used, resolve appropriately
    if (supplierId && supplierType) {
        if (supplierType === 'FACTORY') {
            resolvedFactoryId = supplierId;
        } else if (supplierType === 'BRAND') {
            // For brands, we can either:
            // 1. Create a factory record for the brand
            // 2. Store brand ID in a separate column
            // For now, we'll use brand ID and note it's a brand
            // The display will handle this by checking Brands table
            resolvedFactoryId = supplierId; // Store brand ID in FactoryID field (needs schema note)
        }
    }

    // --- Validation ---
    // Note: supplierId/factoryId is now optional - can be auto-detected from product brand
    if (!warehouseId || !orderDate || !ownershipType || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Champs requis manquants (warehouseId, orderDate, ownershipType, items)' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // --- Step 1: Create PO Header ---
        // Generate PO Number (logic can be customized)
        const poNumberResult = await client.query(
            "SELECT 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('po_seq')::TEXT, 6, '0') as po_number"
            // Note: This requires a 'po_seq' sequence. Let's add it to the schema.
        );
        const poNumber = poNumberResult.rows[0].po_number;

        // Determine IDs
        let finalFactoryId = null;
        let finalBrandId = null;

        if (supplierType === 'BRAND') {
            finalBrandId = resolvedFactoryId; // resolvedFactoryId holds the ID from above logic
        } else {
            finalFactoryId = resolvedFactoryId;
        }

        // Store supplier type in notes if using brand (Optional now with proper column, but kept for legacy)
        const finalNotes = (notes || '');
        const deliveryCost = parseFloat(req.body.deliveryCost) || 0;

        const poHeaderQuery = `
            INSERT INTO PurchaseOrders (
                PONumber, FactoryID, BrandID, WarehouseID, OrderDate, ExpectedDeliveryDate,
                OwnershipType, Notes, CreatedBy, Status, DeliveryCost
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10)
            RETURNING PurchaseOrderID;
        `;
        const poHeaderResult = await client.query(poHeaderQuery, [
            poNumber, finalFactoryId, finalBrandId, warehouseId, orderDate, expectedDeliveryDate || null,
            ownershipType, finalNotes, userId, deliveryCost
        ]);

        const newPurchaseOrderID = poHeaderResult.rows[0].purchaseorderid;

        // --- Step 2: Insert PO Items ---
        let subTotal = 0;
        const itemInsertQuery = `
            INSERT INTO PurchaseOrderItems (
                PurchaseOrderID, ProductID, Quantity, UnitID, UnitPrice, LineTotal
            )
            VALUES ($1, $2, $3, $4, $5, $6);
        `;

        for (const item of items) {
            if (!item.productId || item.quantity == null || item.unitId == null || item.unitPrice == null) {
                throw new Error('Chaque article doit avoir productId, quantity, unitId, et unitPrice.');
            }
            const lineTotal = parseFloat(item.quantity) * parseFloat(item.unitPrice);
            if (isNaN(lineTotal)) {
                throw new Error(`Calcul de total de ligne invalide pour le produit ID ${item.productId}.`);
            }
            subTotal += lineTotal;

            await client.query(itemInsertQuery, [
                newPurchaseOrderID,
                item.productId,
                item.quantity,
                item.unitId,
                item.unitPrice,
                lineTotal
            ]);

            // NOTE: Inventory is NOT updated here - it will be updated when goods are RECEIVED
            // via the goodsReceipt.controller.js. This prevents double-counting.
        }

        // --- Step 3: Update PO Header with Totals ---
        const totalAmount = subTotal + deliveryCost;
        const updatePoTotalQuery = `
            UPDATE PurchaseOrders
            SET SubTotal = $1, TotalAmount = $2
            WHERE PurchaseOrderID = $3;
        `;
        await client.query(updatePoTotalQuery, [subTotal, totalAmount, newPurchaseOrderID]);

        // --- Step 4: Record Payment if provided (using accounting service) ---
        const payment = parseFloat(req.body.payment) || 0;
        const paymentMethod = req.body.paymentMethod || 'ESPECE';

        // Get supplier name for accounting
        let supplierName = 'Fournisseur';
        const supplierQuery = (finalBrandId)
            ? 'SELECT BrandName as name FROM Brands WHERE BrandID = $1'
            : 'SELECT FactoryName as name FROM Factories WHERE FactoryID = $1';
        const supplierResult = await client.query(supplierQuery, [finalBrandId || finalFactoryId]);
        if (supplierResult.rows.length > 0) {
            supplierName = supplierResult.rows[0].name;
        }

        if (payment > 0) {
            await accountingService.recordPurchaseTransaction({
                amount: payment,
                supplierName: supplierName,
                purchaseOrderNumber: poNumber,
                purchaseOrderId: newPurchaseOrderID,
                userId: userId
            }, client);
        }

        await client.query('COMMIT');

        // Refresh materialized view to update stock in catalogue/POS/purchasing
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        } catch (refreshError) {
            console.log('Note: mv_Catalogue refresh skipped:', refreshError.message);
        }

        res.status(201).json({
            success: true,
            message: 'Bon de commande créé avec succès',
            data: { purchaseOrderId: newPurchaseOrderID, poNumber: poNumber, totalAmount: subTotal, paymentRecorded: payment }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erreur création PO:", error);
        // Check for specific sequence error
        if (error.code === '42P01' && error.message.includes('po_seq')) {
            next(new Error("La séquence 'po_seq' n'existe pas. Veuillez l'ajouter à la base de données."));
        } else {
            next(error); // Pass other errors
        }
    } finally {
        client.release();
    }
}


/**
 * Get aggregated purchase history by factory (fournisseur)
 * Shows Total Bought, Total Paid, Total Left for each factory
 */
async function getPurchaseHistory(req, res, next) {
    try {
        const { factoryId, startDate, endDate, buyerId } = req.query;

        let params = [];
        let paramIndex = 1;
        let dateFilter = '';
        let factoryFilter = '';
        let buyerFilter = '';

        if (startDate) {
            dateFilter += ` AND po.OrderDate >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            dateFilter += ` AND po.OrderDate <= $${paramIndex++}`;
            params.push(endDate);
        }
        if (factoryId) {
            factoryFilter = ` AND f.FactoryID = $${paramIndex++}`;
            params.push(factoryId);
        }
        // CreatedBy logic
        if (buyerId) {
            buyerFilter = ` AND po.CreatedBy = $${paramIndex++}`;
            params.push(buyerId);
        }

        const query = `
            WITH SupplierStats AS (
                -- Factories
                SELECT 
                    po.FactoryID as SupplierID,
                    'FACTORY' as SupplierType,
                    COALESCE(SUM(po.TotalAmount), 0) as TotalBought,
                    COUNT(po.PurchaseOrderID) as OrderCount
                FROM PurchaseOrders po
                WHERE po.FactoryID IS NOT NULL ${dateFilter} ${buyerFilter}
                GROUP BY po.FactoryID
                
                UNION ALL
                
                -- Brands
                SELECT 
                    po.BrandID as SupplierID,
                    'BRAND' as SupplierType,
                    COALESCE(SUM(po.TotalAmount), 0) as TotalBought,
                    COUNT(po.PurchaseOrderID) as OrderCount
                FROM PurchaseOrders po
                WHERE po.BrandID IS NOT NULL AND po.FactoryID IS NULL ${dateFilter} ${buyerFilter}
                GROUP BY po.BrandID
            ),
            PaymentTotals AS (
                SELECT 
                    ct.ReferenceID as PurchaseOrderID,
                    SUM(CASE 
                        WHEN ct.TransactionType IN ('ACHAT', 'PAIEMENT') THEN ct.Amount 
                        WHEN ct.TransactionType = 'RETOUR_ACHAT' THEN -ct.Amount 
                        ELSE 0 
                    END) as PaidAmount
                FROM CashTransactions ct
                WHERE ct.TransactionType IN ('ACHAT', 'PAIEMENT', 'RETOUR_ACHAT')
                  AND ct.ReferenceType = 'PURCHASE'
                GROUP BY ct.ReferenceID
            ),
            DirectPayments AS (
                SELECT 
                    ReferenceID as SupplierID, 
                    ReferenceType as SupplierType, 
                    SUM(CASE 
                        WHEN TransactionType IN ('ACHAT', 'PAIEMENT') THEN Amount 
                        WHEN TransactionType = 'RETOUR_ACHAT' THEN -Amount 
                        ELSE 0 
                    END) as PaidAmount
                FROM CashTransactions
                WHERE TransactionType IN ('ACHAT', 'PAIEMENT', 'RETOUR_ACHAT')
                  AND ReferenceType IN ('BRAND', 'FACTORY')
                GROUP BY ReferenceID, ReferenceType
            ),
            SupplierPayments AS (
                -- Factories Payments (PO linked)
                SELECT 
                    po.FactoryID as SupplierID,
                    'FACTORY' as SupplierType,
                    COALESCE(SUM(pt.PaidAmount), 0) as TotalPaid
                FROM PurchaseOrders po
                LEFT JOIN PaymentTotals pt ON po.PurchaseOrderID = pt.PurchaseOrderID
                WHERE po.FactoryID IS NOT NULL ${dateFilter}
                GROUP BY po.FactoryID

                UNION ALL

                -- Brands Payments (PO linked)
                SELECT 
                    po.BrandID as SupplierID,
                    'BRAND' as SupplierType,
                    COALESCE(SUM(pt.PaidAmount), 0) as TotalPaid
                FROM PurchaseOrders po
                LEFT JOIN PaymentTotals pt ON po.PurchaseOrderID = pt.PurchaseOrderID
                WHERE po.BrandID IS NOT NULL AND po.FactoryID IS NULL ${dateFilter}
                GROUP BY po.BrandID
            )
            SELECT 
                s.SupplierID as factoryid, -- Keeping alias 'factoryid' for frontend compatibility for now
                s.SupplierType as suppliertype,
                CASE 
                    WHEN s.SupplierType = 'FACTORY' THEN f.FactoryName
                    WHEN s.SupplierType = 'BRAND' THEN b.BrandName
                END as factoryname,
                CASE 
                    WHEN s.SupplierType = 'FACTORY' THEN f.InitialBalance
                    WHEN s.SupplierType = 'BRAND' THEN b.InitialBalance
                END as initialbalance,
                COALESCE(s.TotalBought, 0) as totalbought,
                COALESCE(sp.TotalPaid, 0) + COALESCE(dp.PaidAmount, 0) as totalpaid,
                COALESCE(CASE WHEN s.SupplierType='FACTORY' THEN f.InitialBalance ELSE b.InitialBalance END, 0) + COALESCE(s.TotalBought, 0) - (COALESCE(sp.TotalPaid, 0) + COALESCE(dp.PaidAmount, 0)) as totalleft,
                COALESCE(s.OrderCount, 0) as ordercount
            FROM SupplierStats s
            LEFT JOIN SupplierPayments sp ON s.SupplierID = sp.SupplierID AND s.SupplierType = sp.SupplierType
            LEFT JOIN DirectPayments dp ON s.SupplierID = dp.SupplierID AND s.SupplierType = dp.SupplierType
            LEFT JOIN Factories f ON s.SupplierID = f.FactoryID AND s.SupplierType = 'FACTORY'
            LEFT JOIN Brands b ON s.SupplierID = b.BrandID AND s.SupplierType = 'BRAND'
            WHERE (s.SupplierType = 'FACTORY' AND f.FactoryID IS NOT NULL)
               OR (s.SupplierType = 'BRAND' AND b.BrandID IS NOT NULL)
            ORDER BY factoryname
        `;

        const result = await pool.query(query, params);

        // Calculate grand totals
        const grandTotals = result.rows.reduce((acc, row) => ({
            totalBought: acc.totalBought + parseFloat(row.totalbought || 0),
            totalPaid: acc.totalPaid + parseFloat(row.totalpaid || 0),
            totalLeft: acc.totalLeft + parseFloat(row.totalleft || 0),
            orderCount: acc.orderCount + parseInt(row.ordercount || 0)
        }), { totalBought: 0, totalPaid: 0, totalLeft: 0, orderCount: 0 });

        res.json({
            success: true,
            data: result.rows,
            summary: grandTotals
        });
    } catch (error) {
        console.error('Error in getPurchaseHistory:', error);
        next(error);
    }
}

/**
 * Get detailed purchase history for a specific factory
 * Shows all purchase orders and payments for drilling down
 */
async function getFactoryPurchaseDetails(req, res, next) {
    try {
        const { factoryId } = req.params;
        const { startDate, endDate, type = 'FACTORY' } = req.query;

        const supplierId = factoryId;
        const isBrand = (type || '').toUpperCase() === 'BRAND';

        let params = [supplierId];
        let paramIndex = 2;
        let dateFilter = '';

        if (startDate) {
            dateFilter += ` AND po.OrderDate >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            dateFilter += ` AND po.OrderDate <= $${paramIndex++}`;
            params.push(endDate);
        }

        // Get supplier (factory or brand) info
        let supplierQuery = '';
        if (isBrand) {
            supplierQuery = `SELECT BrandID as FactoryID, BrandName as FactoryName, NULL as ContactPerson, NULL as Phone, NULL as Email, InitialBalance FROM Brands WHERE BrandID = $1`;
        } else {
            supplierQuery = `SELECT FactoryID, FactoryName, ContactPerson, Phone, Email, InitialBalance FROM Factories WHERE FactoryID = $1`;
        }

        const supplierResult = await pool.query(supplierQuery, [supplierId]);

        if (supplierResult.rows.length === 0) {
            console.warn(`Supplier not found: ID=${supplierId}, Type=${type}, isBrand=${isBrand}`);
            return res.status(404).json({ success: false, message: `Fournisseur non trouvé (ID: ${supplierId}, Type: ${type})` });
        }
        const supplierInfo = supplierResult.rows[0];
        const initialBalance = parseFloat(supplierInfo.initialbalance || 0);

        // Filter for POs
        const supplierFilter = isBrand
            ? `po.BrandID = $1`
            : `po.FactoryID = $1`;

        // Get all purchase orders for this supplier
        const ordersQuery = `
            SELECT 
                po.PurchaseOrderID as purchaseorderid,
                po.PONumber as ponumber,
                po.OrderDate as orderdate,
                po.Status as status,
                po.TotalAmount as totalamount,
                po.OwnershipType as ownershiptype,
                w.WarehouseName as warehousename,
                COALESCE(payments.paid, 0) as amountpaid,
                po.TotalAmount - COALESCE(payments.paid, 0) as amountleft
            FROM PurchaseOrders po
            LEFT JOIN Warehouses w ON po.WarehouseID = w.WarehouseID
            LEFT JOIN (
                SELECT ReferenceID, SUM(Amount) as paid
                FROM CashTransactions
                WHERE TransactionType = 'ACHAT' AND ReferenceType = 'PURCHASE'
                GROUP BY ReferenceID
            ) payments ON po.PurchaseOrderID = payments.ReferenceID
            WHERE ${supplierFilter} ${dateFilter}
            ORDER BY po.OrderDate DESC
        `;
        const ordersResult = await pool.query(ordersQuery, params);

        // Get payment history for this supplier
        // Get payment history for this supplier (PO linked + Direct)
        // Need to capture TransactionType for total calculation
        const paymentsQuery = `
            SELECT 
                ct.TransactionID as transactionid,
                ct.CreatedAt as transactiondate,
                ct.Amount as amount,
                ct.TransactionType as transactiontype,
                COALESCE(ct.Motif, ct.Notes, '') as description,
                po.PONumber as ponumber
            FROM CashTransactions ct
            LEFT JOIN PurchaseOrders po ON ct.ReferenceID = po.PurchaseOrderID AND ct.ReferenceType = 'PURCHASE'
            WHERE 
                ct.TransactionType IN ('ACHAT', 'PAIEMENT', 'RETOUR_ACHAT')
                AND (
                    (ct.ReferenceType = 'PURCHASE' AND ${supplierFilter})
                    OR
                    (ct.ReferenceType = '${isBrand ? 'BRAND' : 'FACTORY'}' AND ct.ReferenceID = $1)
                )
            ORDER BY ct.CreatedAt DESC
        `;
        const paymentsResult = await pool.query(paymentsQuery, [supplierId]);

        // Calculate totals
        // Compute totals from Orders AND Payments
        // Total Bought comes from Orders
        const totalBought = ordersResult.rows.reduce((sum, o) => sum + parseFloat(o.totalamount || 0), 0);

        // Total Paid comes from ALL payments (Orders + Direct)
        // We need to sum the paymentsResult correctly (handling RETOUR_ACHAT as negative if needed, though usually stored as positive Amount? 
        // In query above we handled signed summation? No we select raw Amount. 
        // We should handle sign here or in query. Let's do it in JS for simplicity if type available.
        // Wait, paymentsResult doesn't have Type selected. Let's add it.
        const totalPaid = paymentsResult.rows.reduce((sum, p) => {
            // Assuming Amount is positive. If RETOUR_ACHAT, subtract.
            // Need transactiontype in select.
            const amt = parseFloat(p.amount || 0);
            return (p.transactiontype === 'RETOUR_ACHAT') ? sum - amt : sum + amt;
        }, 0);

        const totals = {
            initialBalance: initialBalance,
            totalBought: totalBought,
            totalPaid: totalPaid,
            totalLeft: initialBalance + totalBought - totalPaid
        };

        res.json({
            success: true,
            data: {
                factory: supplierResult.rows[0],
                orders: ordersResult.rows,
                payments: paymentsResult.rows,
                totals: totals
            }
        });
    } catch (error) {
        console.error('Error in getFactoryPurchaseDetails:', error);
        next(error);
    }
}

/**
 * Update logic for Pending PO
 */
/**
 * Update logic for Pending or Received PO
 */
async function updatePurchaseOrder(req, res, next) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const {
            factoryId, supplierId, supplierType, warehouseId, orderDate,
            expectedDeliveryDate, ownershipType, notes, items,
            payment, paymentMethod
        } = req.body;
        const userId = req.user?.userId;

        // 1. Check status
        const checkRes = await client.query('SELECT Status, PONumber, FactoryID, BrandID, WarehouseID FROM PurchaseOrders WHERE PurchaseOrderID = $1', [id]);
        if (checkRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Purchase Order not found' });
        }

        const currentStatus = checkRes.rows[0].status;
        const allowedStatuses = ['PENDING', 'RECEIVED', 'PARTIAL'];

        if (!allowedStatuses.includes(currentStatus)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Seules les commandes en attente ou reçues peuvent être modifiées.' });
        }

        const poNumber = checkRes.rows[0].ponumber;
        const existingFactoryId = checkRes.rows[0].factoryid;
        const existingBrandId = checkRes.rows[0].brandid;
        const existingWarehouseId = checkRes.rows[0].warehouseid;

        // Resolve FactoryID (Simulated logic from create)
        let resolvedFactoryId = factoryId || supplierId;

        // 2. Update Header
        await client.query(`
            UPDATE PurchaseOrders SET
                FactoryID = $1, WarehouseID = $2, OrderDate = $3, ExpectedDeliveryDate = $4,
                OwnershipType = $5, Notes = $6, UpdatedAt = CURRENT_TIMESTAMP
            WHERE PurchaseOrderID = $7
        `, [resolvedFactoryId, warehouseId, orderDate, expectedDeliveryDate || null, ownershipType, notes, id]);

        // Helper: Parse Dimensions
        const parseDimensions = (str) => {
            if (!str) return 0;
            const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
            if (match) {
                return (parseInt(match[1]) * parseInt(match[2])) / 10000;
            }
            return 0;
        };

        // 3. Update Items
        let subTotal = 0;

        // Fetch WarehouseID for stock updates (Use existing if not provided/changed, or ensure we track the change)
        // Actually, we already updated the header with the new WarehouseID. 
        // PROPER LOGIC: 
        // 1. If Warehouse Changed: We technically need to "Move" the OLD stock from Old Warehouse to New Warehouse.
        //    But for simplicity, we'll assume we Revert OLD items from OLD Warehouse, and Add NEW items to NEW Warehouse.
        //    However, `existingWarehouseId` is what the stock was IN.
        //    `warehouseId` (from body) is what the stock will be IN.

        const oldWarehouseId = existingWarehouseId || 1; // Fallback to 1 if null (shouldn't be)
        const targetWarehouseId = warehouseId || oldWarehouseId;

        if (currentStatus === 'PENDING') {
            // STRATEGY: Delete All & Recreate (Simple)
            await client.query('DELETE FROM PurchaseOrderItems WHERE PurchaseOrderID = $1', [id]);

            for (const item of items) {
                const lineTotal = parseFloat(item.quantity) * parseFloat(item.unitPrice);
                subTotal += lineTotal;
                await client.query(`
                    INSERT INTO PurchaseOrderItems (PurchaseOrderID, ProductID, Quantity, UnitID, UnitPrice, LineTotal)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [id, item.productId, item.quantity, item.unitId, item.unitPrice, lineTotal]);
            }
        } else {
            // STRATEGY: RECEIVED/PARTIAL -> Smart Update (Upsert/Delete) & Adjust Inventory

            // Fetch old items for comparison
            const oldItemsRes = await client.query(`
                SELECT poi.*, u.UnitCode, p.ProductName, p.Size
                FROM PurchaseOrderItems poi
                LEFT JOIN Units u ON poi.UnitID = u.UnitID
                JOIN Products p ON poi.ProductID = p.ProductID
                WHERE poi.PurchaseOrderID = $1
            `, [id]);

            // Map keys should be consistent (String)
            const oldItemsMap = new Map(oldItemsRes.rows.map(i => [String(i.poitemid), i]));
            const processedIds = new Set();

            for (const item of items) {
                const lineTotal = parseFloat(item.quantity) * parseFloat(item.unitPrice);
                subTotal += lineTotal;

                // Get Product Info for Unit Conversion of NEW/UPDATED Item
                const productInfo = await client.query(
                    `SELECT ProductName, Size FROM Products WHERE ProductID = $1`,
                    [item.productId]
                );
                const pInfo = productInfo.rows[0];
                const sqmPerPiece = parseDimensions(pInfo?.size || pInfo?.productname);

                const unitRes = await client.query('SELECT UnitCode FROM Units WHERE UnitID = $1', [item.unitId]);
                const unitCode = unitRes.rows[0]?.unitcode || 'PCS';

                let quantityInStockUnit = parseFloat(item.quantity);
                if (unitCode === 'PCS' && sqmPerPiece > 0) {
                    quantityInStockUnit = quantityInStockUnit * sqmPerPiece;
                }

                const itemPoolId = String(item.poItemId || ''); // Ensure String for comparison

                if (itemPoolId && oldItemsMap.has(itemPoolId)) {
                    // --- UPDATE EXISTING ITEM ---
                    const oldItem = oldItemsMap.get(itemPoolId);
                    processedIds.add(itemPoolId);

                    // Calculate Old Stock Qty (what was previously added)
                    let oldQuantityInStockUnit = parseFloat(oldItem.quantity);
                    const oldSqmPerPiece = parseDimensions(oldItem.size || oldItem.productname);
                    if (oldItem.unitcode === 'PCS' && oldSqmPerPiece > 0) {
                        oldQuantityInStockUnit = oldQuantityInStockUnit * oldSqmPerPiece;
                    }

                    // Strict Revert and Add logic handles Warehouse changes implicitly if we did it separately,
                    // but here we do a 'Diff' logic. 
                    // ISSUE: If Warehouse Changed, 'Diff' doesn't work across warehouses.

                    if (String(oldWarehouseId) !== String(targetWarehouseId)) {
                        // Warehouse Changed!
                        // Remove OLD from OLD Warehouse
                        await client.query(`
                            UPDATE Inventory 
                            SET QuantityOnHand = QuantityOnHand - $1
                            WHERE ProductID = $2 AND WarehouseID = $3
                        `, [oldQuantityInStockUnit, oldItem.productid, oldWarehouseId]);

                        // Add NEW to NEW Warehouse
                        await client.query(`
                            UPDATE Inventory 
                            SET QuantityOnHand = QuantityOnHand + $1
                            WHERE ProductID = $2 AND WarehouseID = $3
                        `, [quantityInStockUnit, item.productId, targetWarehouseId]);
                    } else {
                        // Same Warehouse - Calculate Diff
                        // Note: ProductID might have changed too!
                        if (String(oldItem.productid) !== String(item.productId)) {
                            // Product Changed! Revert Old, Add New
                            await client.query(`
                                UPDATE Inventory 
                                SET QuantityOnHand = QuantityOnHand - $1
                                WHERE ProductID = $2 AND WarehouseID = $3
                            `, [oldQuantityInStockUnit, oldItem.productid, targetWarehouseId]);

                            await client.query(`
                                UPDATE Inventory 
                                SET QuantityOnHand = QuantityOnHand + $1
                                WHERE ProductID = $2 AND WarehouseID = $3
                            `, [quantityInStockUnit, item.productId, targetWarehouseId]);
                        } else {
                            // Same Product, Same Warehouse -> Diff works
                            const stockDiff = quantityInStockUnit - oldQuantityInStockUnit;
                            if (stockDiff !== 0) {
                                await client.query(`
                                    UPDATE Inventory 
                                    SET QuantityOnHand = QuantityOnHand + $1
                                    WHERE ProductID = $2 AND WarehouseID = $3
                                `, [stockDiff, item.productId, targetWarehouseId]);
                            }
                        }
                    }

                    // Update DB Item
                    await client.query(`
                        UPDATE PurchaseOrderItems 
                        SET Quantity = $1, UnitPrice = $2, LineTotal = $3, UnitID = $4,
                            ReceivedQuantity = $1, ProductID = $6
                        WHERE POItemID = $5
                    `, [item.quantity, item.unitPrice, lineTotal, item.unitId, itemPoolId, item.productId]);

                } else {
                    // --- INSERT NEW ITEM ---
                    const insertRes = await client.query(`
                        INSERT INTO PurchaseOrderItems (PurchaseOrderID, ProductID, Quantity, ReceivedQuantity, UnitID, UnitPrice, LineTotal)
                        VALUES ($1, $2, $3, $3, $4, $5, $6)
                        RETURNING POItemID
                    `, [id, item.productId, item.quantity, item.unitId, item.unitPrice, lineTotal]);

                    // Add to Inventory
                    await client.query(`
                        UPDATE Inventory 
                        SET QuantityOnHand = QuantityOnHand + $1
                        WHERE ProductID = $2 AND WarehouseID = $3
                    `, [quantityInStockUnit, item.productId, targetWarehouseId]);
                }
            }

            // --- HANDLE DELETIONS ---
            for (const [oldId, oldItem] of oldItemsMap) {
                if (!processedIds.has(oldId)) {
                    try {
                        // Revert Stock
                        let oldQuantityInStockUnit = parseFloat(oldItem.quantity);
                        const oldSqmPerPiece = parseDimensions(oldItem.size || oldItem.productname);
                        if (oldItem.unitcode === 'PCS' && oldSqmPerPiece > 0) {
                            oldQuantityInStockUnit = oldQuantityInStockUnit * oldSqmPerPiece;
                        }

                        // Remove from Inventory (Old Warehouse)
                        await client.query(`
                            UPDATE Inventory 
                            SET QuantityOnHand = QuantityOnHand - $1
                            WHERE ProductID = $2 AND WarehouseID = $3
                        `, [oldQuantityInStockUnit, oldItem.productid, oldWarehouseId]);

                        // Attempt Delete
                        await client.query('DELETE FROM PurchaseOrderItems WHERE POItemID = $1', [oldId]);

                    } catch (err) {
                        // Constraint Error likely
                        if (err.code === '23503') { // Foreign key violation
                            throw new Error(`Impossible de supprimer l'article "${oldItem.productname}" car il a déjà été réceptionné (lié à un Bon de Réception). Mettez la quantité à 0 si vous souhaitez l'annuler.`);
                        }
                        throw err;
                    }
                }
            }
        }

        // 4. Update Header Total
        await client.query('UPDATE PurchaseOrders SET SubTotal = $1, TotalAmount = $1 WHERE PurchaseOrderID = $2', [subTotal, id]);

        // 5. Record Payment (Legacy Logic preserved)

        const paymentAmount = parseFloat(payment) || 0;
        if (paymentAmount > 0) {
            // Get supplier name for accounting
            let supplierName = 'Fournisseur';
            const isBrand = existingBrandId && !existingFactoryId;
            const supplierQuery = isBrand
                ? 'SELECT BrandName as name FROM Brands WHERE BrandID = $1'
                : 'SELECT FactoryName as name FROM Factories WHERE FactoryID = $1';
            const supplierResult = await client.query(supplierQuery, [isBrand ? existingBrandId : (resolvedFactoryId || existingFactoryId)]);
            if (supplierResult.rows.length > 0) {
                supplierName = supplierResult.rows[0].name;
            }

            await accountingService.recordPurchaseTransaction({
                amount: paymentAmount,
                supplierName: supplierName,
                purchaseOrderNumber: poNumber,
                purchaseOrderId: parseInt(id),
                userId: userId,
                paymentMethod: paymentMethod || 'ESPECE'
            }, client);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Bon de commande mis à jour avec succès', data: { purchaseOrderID: id, paymentRecorded: paymentAmount } });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating purchase order:', error);
        // Pass error to express error handler to ensure JSON response
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
}

async function deletePurchaseOrder(req, res, next) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;

        const checkRes = await client.query('SELECT Status FROM PurchaseOrders WHERE PurchaseOrderID = $1', [id]);
        if (checkRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Purchase Order not found' });
        }
        if (checkRes.rows[0].status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Seules les commandes en attente peuvent être supprimées.' });
        }

        // Delete Items first (Cascade might handle it, but explicit is safer logic wise if no cascade)
        await client.query('DELETE FROM PurchaseOrderItems WHERE PurchaseOrderID = $1', [id]);
        await client.query('DELETE FROM PurchaseOrders WHERE PurchaseOrderID = $1', [id]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Bon de commande supprimé avec succès' });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
}

module.exports = {
    getPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    getPurchaseHistory,
    getFactoryPurchaseDetails,
    updatePurchaseOrder,
    deletePurchaseOrder
};
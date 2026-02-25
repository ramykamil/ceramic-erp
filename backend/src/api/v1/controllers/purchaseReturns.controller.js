const pool = require('../../../config/database');
const accountingService = require('../services/accounting.service');

/**
 * GET /purchase-returns
 * List all purchase returns with filters
 */
const getPurchaseReturns = async (req, res) => {
    try {
        const { factoryId, status, startDate, endDate, createdBy, limit = 100, offset = 0 } = req.query;

        let query = `
      SELECT 
        pr.ReturnID as returnid,
        pr.ReturnNumber as returnnumber,
        pr.PurchaseOrderID as purchaseorderid,
        mt.PONumber as ponumber,
        pr.FactoryID as factoryid,
        COALESCE(f.FactoryName, b.BrandName) as factoryname,
        pr.ReturnDate as returndate,
        pr.Status as status,
        pr.TotalAmount as totalamount,
        pr.Notes as notes,
        pr.CreatedAt as createdat,
        u.Username as createdbyname,
        COUNT(pri.ReturnItemID) as itemcount
      FROM PurchaseReturns pr
      LEFT JOIN PurchaseOrders mt ON pr.PurchaseOrderID = mt.PurchaseOrderID
      LEFT JOIN Factories f ON pr.FactoryID = f.FactoryID
      LEFT JOIN Brands b ON pr.BrandID = b.BrandID
      LEFT JOIN Users u ON pr.CreatedBy = u.UserID
      LEFT JOIN PurchaseReturnItems pri ON pr.ReturnID = pri.ReturnID
      WHERE 1=1
    `;
        const params = [];
        let paramCount = 0;

        if (factoryId) {
            paramCount++;
            query += ` AND (pr.FactoryID = $${paramCount} OR pr.BrandID = $${paramCount})`; // Simplified: factoryId param matches either
            params.push(factoryId);
        }

        if (status) {
            paramCount++;
            query += ` AND pr.Status = $${paramCount}`;
            params.push(status);
        }

        if (startDate) {
            paramCount++;
            query += ` AND pr.ReturnDate >= $${paramCount}`;
            params.push(startDate);
        }

        if (endDate) {
            paramCount++;
            query += ` AND pr.ReturnDate <= $${paramCount}`;
            params.push(endDate);
        }

        if (createdBy) {
            paramCount++;
            query += ` AND pr.CreatedBy = $${paramCount}`;
            params.push(createdBy);
        }

        query += `
      GROUP BY pr.ReturnID, pr.ReturnNumber, mt.PONumber, pr.FactoryID, f.FactoryName, b.BrandName, 
               pr.ReturnDate, pr.Status, pr.TotalAmount, pr.Notes, pr.CreatedAt, u.Username
      ORDER BY pr.ReturnDate DESC, pr.ReturnID DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error in getPurchaseReturns:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * GET /purchase-returns/:id
 * Get return details with items
 */
const getPurchaseReturnById = async (req, res) => {
    try {
        const { id } = req.params;

        // Get header
        const returnResult = await pool.query(`
      SELECT 
        pr.ReturnID as returnid,
        pr.ReturnNumber as returnnumber,
        pr.PurchaseOrderID as purchaseorderid,
        mt.PONumber as ponumber,
        pr.FactoryID as factoryid,
        pr.BrandID as brandid,
        COALESCE(f.FactoryName, b.BrandName) as factoryname,
        pr.ReturnDate as returndate,
        pr.Status as status,
        pr.TotalAmount as totalamount,
        pr.Notes as notes,
        u.Username as createdbyname,
        pr.CreatedAt as createdat
      FROM PurchaseReturns pr
      LEFT JOIN PurchaseOrders mt ON pr.PurchaseOrderID = mt.PurchaseOrderID
      LEFT JOIN Factories f ON pr.FactoryID = f.FactoryID
      LEFT JOIN Brands b ON pr.BrandID = b.BrandID
      LEFT JOIN Users u ON pr.CreatedBy = u.UserID
      WHERE pr.ReturnID = $1
    `, [id]);

        if (returnResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Return not found' });
        }

        // Get items
        const itemsResult = await pool.query(`
      SELECT 
        pri.ReturnItemID as returnitemid,
        pri.ProductID as productid,
        p.ProductCode as productcode,
        p.ProductName as productname,
        pri.Quantity as quantity,
        pri.UnitID as unitid,
        u.UnitCode as unitcode,
        pri.UnitPrice as unitprice,
        pri.Total as total,
        pri.Reason as reason
      FROM PurchaseReturnItems pri
      JOIN Products p ON pri.ProductID = p.ProductID
      LEFT JOIN Units u ON pri.UnitID = u.UnitID
      WHERE pri.ReturnID = $1
      ORDER BY pri.ReturnItemID
    `, [id]);

        res.json({
            success: true,
            data: {
                ...returnResult.rows[0],
                items: itemsResult.rows
            }
        });
    } catch (error) {
        console.error('Error in getPurchaseReturnById:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * POST /purchase-returns
 * Create a new return
 */
const createPurchaseReturn = async (req, res) => {
    const client = await pool.connect();
    try {
        const { factoryId, brandId, purchaseOrderId, date, notes, items } = req.body;
        const userId = req.user.userId;

        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one item is required'
            });
        }

        await client.query('BEGIN');

        // Generate return number
        const seqResult = await client.query("SELECT nextval('purchase_returns_seq')");
        const seq = seqResult.rows[0].nextval;
        const returnNumber = `RET-ACH-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;

        // Calculate total
        let totalAmount = 0;
        items.forEach(item => {
            totalAmount += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
        });

        const returnDate = date || new Date();

        // Insert header
        const returnResult = await client.query(`
      INSERT INTO PurchaseReturns (ReturnNumber, PurchaseOrderID, FactoryID, BrandID, ReturnDate, Status, TotalAmount, Notes, CreatedBy)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8)
      RETURNING ReturnID, ReturnNumber
    `, [returnNumber, purchaseOrderId || null, factoryId || null, brandId || null, returnDate, totalAmount, notes, userId]);

        const returnId = returnResult.rows[0].returnid;

        // Insert items
        for (const item of items) {
            const qty = parseFloat(item.quantity);
            const price = parseFloat(item.unitPrice);
            const total = qty * price;

            await client.query(`
        INSERT INTO PurchaseReturnItems (ReturnID, ProductID, Quantity, UnitID, UnitPrice, Total, Reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [returnId, item.productId, qty, item.unitId || null, price, total, item.reason]);
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Purchase Return created successfully',
            data: {
                returnId,
                returnNumber: returnResult.rows[0].returnnumber
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in createPurchaseReturn:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    } finally {
        client.release();
    }
};

/**
 * PUT /purchase-returns/:id/status
 * Update status (Approve -> Updates Inventory)
 */
const updatePurchaseReturnStatus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['PENDING', 'APPROVED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Check current status
        const currentRes = await client.query('SELECT Status, ReturnNumber, FactoryID, BrandID FROM PurchaseReturns WHERE ReturnID = $1', [id]);
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Return not found' });
        }
        const oldStatus = currentRes.rows[0].status;
        const returnNumber = currentRes.rows[0].returnnumber;

        if (oldStatus === 'APPROVED') {
            return res.status(400).json({ success: false, message: 'Cannot change status of already APPROVED return' });
        }

        await client.query('BEGIN');

        // Update status
        await client.query('UPDATE PurchaseReturns SET Status = $1, UpdatedAt = CURRENT_TIMESTAMP WHERE ReturnID = $2', [status, id]);

        // If Approving, update inventory (DECREASE stock)
        if (status === 'APPROVED') {
            const itemsRes = await client.query(`
                SELECT pri.*, p.ProductName, p.Size, u.UnitCode
                FROM PurchaseReturnItems pri
                JOIN Products p ON pri.ProductID = p.ProductID
                LEFT JOIN Units u ON pri.UnitID = u.UnitID
                WHERE pri.ReturnID = $1
            `, [id]);

            const warehouseId = 1; // Default to Main Warehouse for now, or fetch from PO

            // Helper for dimensions
            const parseDimensions = (str) => {
                if (!str) return 0;
                const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
                if (match) {
                    return (parseInt(match[1]) * parseInt(match[2])) / 10000;
                }
                return 0;
            };

            for (const item of itemsRes.rows) {
                let qtyToRemove = parseFloat(item.quantity) || 0;

                // --- UNIT CONVERSION LOGIC ---
                const isSoldInPieces = item.unitcode === 'PCS';
                const sqmPerPiece = parseDimensions(item.size || item.productname);

                if (isSoldInPieces && sqmPerPiece > 0) {
                    const convertedQty = qtyToRemove * sqmPerPiece;
                    console.log(`[PurchaseReturn] Converting ${qtyToRemove} PCS of ${item.productname} to ${convertedQty.toFixed(4)} SQM`);
                    qtyToRemove = convertedQty;
                }

                // Update Inventory (DECREASE)
                await client.query(`
                    UPDATE Inventory 
                    SET QuantityOnHand = QuantityOnHand - $1, UpdatedAt = CURRENT_TIMESTAMP
                    WHERE ProductID = $2 AND WarehouseID = $3
                `, [qtyToRemove, item.productid, warehouseId]);

                // Record Transaction (OUT)
                await client.query(`
                    INSERT INTO InventoryTransactions 
                    (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes)
                    VALUES ($1, $2, 'OUT', $3, 'RETURN_TO_SUPPLIER', $4, $5)
                `, [item.productid, warehouseId, qtyToRemove, id, `Return to Supplier Approved ${returnNumber}`]);
            }

            // --- Record RETOUR_ACHAT cash transaction ---
            const totalAmount = parseFloat(
                (await client.query('SELECT TotalAmount FROM PurchaseReturns WHERE ReturnID = $1', [id])).rows[0]?.totalamount
            ) || 0;

            if (totalAmount > 0) {
                // Get supplier name
                const factoryId = currentRes.rows[0].factoryid;
                const brandId = currentRes.rows[0].brandid;
                let supplierName = 'Fournisseur';
                let poNumber = '';

                if (brandId) {
                    const brandRes = await client.query('SELECT BrandName FROM Brands WHERE BrandID = $1', [brandId]);
                    supplierName = brandRes.rows[0]?.brandname || supplierName;
                } else if (factoryId) {
                    const factRes = await client.query('SELECT FactoryName FROM Factories WHERE FactoryID = $1', [factoryId]);
                    supplierName = factRes.rows[0]?.factoryname || supplierName;
                }

                // Get PO number if linked
                const prInfo = await client.query('SELECT PurchaseOrderID FROM PurchaseReturns WHERE ReturnID = $1', [id]);
                if (prInfo.rows[0]?.purchaseorderid) {
                    const poRes = await client.query('SELECT PONumber FROM PurchaseOrders WHERE PurchaseOrderID = $1', [prInfo.rows[0].purchaseorderid]);
                    poNumber = poRes.rows[0]?.ponumber || '';
                }

                await accountingService.recordPurchaseReturnTransaction({
                    amount: totalAmount,
                    supplierName: supplierName,
                    purchaseOrderNumber: poNumber || returnNumber,
                    returnId: id,
                    userId: req.user?.userId
                }, client);

                // --- Update Supplier Balance (reduce debt) ---
                if (brandId) {
                    await client.query(
                        'UPDATE Brands SET CurrentBalance = CurrentBalance - $1, UpdatedAt = NOW() WHERE BrandID = $2',
                        [totalAmount, brandId]
                    );
                    console.log(`[PurchaseReturn] Reduced brand ${brandId} balance by ${totalAmount}`);
                } else if (factoryId) {
                    await client.query(
                        'UPDATE Factories SET CurrentBalance = CurrentBalance - $1, UpdatedAt = NOW() WHERE FactoryID = $2',
                        [totalAmount, factoryId]
                    );
                    console.log(`[PurchaseReturn] Reduced factory ${factoryId} balance by ${totalAmount}`);
                }
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Status updated successfully'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in updatePurchaseReturnStatus:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    } finally {
        client.release();
    }
};

/**
 * DELETE /purchase-returns/:id
 */
const deletePurchaseReturn = async (req, res) => {
    try {
        const { id } = req.params;

        const checkRes = await pool.query('SELECT Status FROM PurchaseReturns WHERE ReturnID = $1', [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Return not found' });
        }

        if (checkRes.rows[0].status !== 'PENDING') {
            return res.status(400).json({ success: false, message: 'Only PENDING returns can be deleted' });
        }

        await pool.query('DELETE FROM PurchaseReturns WHERE ReturnID = $1', [id]);

        res.json({ success: true, message: 'Return deleted successfully' });
    } catch (error) {
        console.error('Error in deletePurchaseReturn:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    getPurchaseReturns,
    getPurchaseReturnById,
    createPurchaseReturn,
    updatePurchaseReturnStatus,
    deletePurchaseReturn
};

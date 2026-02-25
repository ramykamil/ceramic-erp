const pool = require('../../../config/database');
const accountingService = require('../services/accounting.service');

/**
 * GET /returns
 * List all returns with filters
 */
const getReturns = async (req, res) => {
    try {
        const { customerId, status, startDate, endDate, createdBy, limit = 100, offset = 0 } = req.query;

        let query = `
      SELECT 
        r.ReturnID as returnid,
        r.ReturnNumber as returnnumber,
        r.OrderID as orderid,
        r.CustomerID as customerid,
        COALESCE(c.CustomerName, r.ClientName) as customername,
        r.ReturnDate as returndate,
        r.Reason as reason,
        r.Status as status,
        r.TotalAmount as totalamount,
        r.Notes as notes,
        r.CreatedAt as createdat,
        r.CreatedBy as createdbyid,
        COUNT(ri.ReturnItemID) as itemcount
      FROM Returns r
      LEFT JOIN Customers c ON r.CustomerID = c.CustomerID
      LEFT JOIN ReturnItems ri ON r.ReturnID = ri.ReturnID
      WHERE 1=1
    `;
        const params = [];
        let paramCount = 0;

        if (customerId) {
            paramCount++;
            query += ` AND r.CustomerID = $${paramCount}`;
            params.push(customerId);
        }

        if (status) {
            paramCount++;
            query += ` AND r.Status = $${paramCount}`;
            params.push(status);
        }

        if (startDate) {
            paramCount++;
            query += ` AND r.ReturnDate >= $${paramCount}`;
            params.push(startDate);
        }

        if (endDate) {
            paramCount++;
            query += ` AND r.ReturnDate <= $${paramCount}`;
            params.push(endDate);
        }

        if (createdBy) {
            paramCount++;
            query += ` AND r.CreatedBy = $${paramCount}`;
            params.push(createdBy);
        }

        query += `
      GROUP BY r.ReturnID, r.ReturnNumber, r.OrderID, r.CustomerID, c.CustomerName, 
               r.ReturnDate, r.Reason, r.Status, r.TotalAmount, r.Notes, r.CreatedAt, r.CreatedBy
      ORDER BY r.ReturnDate DESC, r.ReturnID DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error in getReturns:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * GET /returns/:id
 * Get return details with items
 */
const getReturnById = async (req, res) => {
    try {
        const { id } = req.params;

        // Get return header
        const returnResult = await pool.query(`
      SELECT 
        r.ReturnID as returnid,
        r.ReturnNumber as returnnumber,
        r.OrderID as orderid,
        o.OrderNumber as ordernumber,
        r.CustomerID as customerid,
        COALESCE(c.CustomerName, r.ClientName) as customername,
        COALESCE(c.Phone, r.ClientPhone) as customerphone,
        COALESCE(c.Address, r.ClientAddress) as customeraddress,
        r.ReturnDate as returndate,
        r.Reason as reason,
        r.Status as status,
        r.TotalAmount as totalamount,
        r.Notes as notes,
        r.CreatedBy as createdby,
        r.CreatedAt as createdat
      FROM Returns r
      LEFT JOIN Customers c ON r.CustomerID = c.CustomerID
      LEFT JOIN Orders o ON r.OrderID = o.OrderID
      WHERE r.ReturnID = $1
    `, [id]);

        if (returnResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Return not found' });
        }

        // Get return items
        const itemsResult = await pool.query(`
      SELECT 
        ri.ReturnItemID as returnitemid,
        ri.ProductID as productid,
        p.ProductCode as productcode,
        p.ProductName as productname,
        ri.Quantity as quantity,
        ri.UnitID as unitid,
        u.UnitCode as unitcode,
        ri.UnitPrice as unitprice,
        ri.LineTotal as linetotal,
        ri.Reason as reason
      FROM ReturnItems ri
      JOIN Products p ON ri.ProductID = p.ProductID
      LEFT JOIN Units u ON ri.UnitID = u.UnitID
      WHERE ri.ReturnID = $1
      ORDER BY ri.ReturnItemID
    `, [id]);

        res.json({
            success: true,
            data: {
                ...returnResult.rows[0],
                items: itemsResult.rows
            }
        });
    } catch (error) {
        console.error('Error in getReturnById:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * POST /returns
 * Create a new return with items and adjust inventory
 * Supports either customerId OR manual client (clientName, clientPhone, clientAddress)
 */
const createReturn = async (req, res) => {
    const client = await pool.connect();
    try {
        const { customerId, clientName, clientPhone, clientAddress, orderId, reason, notes, items } = req.body;

        // Validate: either customerId or clientName required
        if (!customerId && !clientName) {
            return res.status(400).json({
                success: false,
                message: 'Either Customer ID or Client Name is required'
            });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one item is required'
            });
        }

        await client.query('BEGIN');

        // Generate return number
        const seqResult = await client.query("SELECT nextval('returns_seq')");
        const seq = seqResult.rows[0].nextval;
        const returnNumber = `RET-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;

        // Calculate total
        let totalAmount = 0;
        items.forEach(item => {
            totalAmount += (item.quantity || 0) * (item.unitPrice || 0);
        });

        // Insert return header (with either customer ID or manual client info)
        const returnResult = await client.query(`
      INSERT INTO Returns (ReturnNumber, OrderID, CustomerID, ClientName, ClientPhone, ClientAddress, Reason, TotalAmount, Notes, Status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
      RETURNING ReturnID, ReturnNumber
    `, [returnNumber, orderId || null, customerId || null, clientName || null, clientPhone || null, clientAddress || null, reason, totalAmount, notes]);

        const returnId = returnResult.rows[0].returnid;

        // Insert return items
        for (const item of items) {
            const qty = parseFloat(item.quantity);
            if (!qty || qty <= 0) {
                throw new Error(`Quantité invalide pour le retour: ${qty}. Doit être supérieure à 0.`);
            }
            const lineTotal = qty * (item.unitPrice || 0);

            // Insert return item
            await client.query(`
        INSERT INTO ReturnItems (ReturnID, ProductID, Quantity, UnitID, UnitPrice, LineTotal, Reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [returnId, item.productId, item.quantity, item.unitId || null, item.unitPrice || 0, lineTotal, item.reason]);
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Return created successfully',
            data: {
                returnId,
                returnNumber: returnResult.rows[0].returnnumber
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in createReturn:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    } finally {
        client.release();
    }
};

/**
 * PUT /returns/:id/status
 * Update return status
 */
const updateReturnStatus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['PENDING', 'APPROVED', 'PROCESSED', 'REJECTED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Check current status first
        const currentRes = await client.query('SELECT Status, TotalAmount, CustomerID, ReturnNumber FROM Returns WHERE ReturnID = $1', [id]);
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Return not found' });
        }
        const oldStatus = currentRes.rows[0].status;
        const totalAmount = parseFloat(currentRes.rows[0].totalamount) || 0;
        const customerId = currentRes.rows[0].customerid;
        const returnNumber = currentRes.rows[0].returnnumber;

        await client.query('BEGIN');

        const result = await client.query(`
      UPDATE Returns 
      SET Status = $1 
      WHERE ReturnID = $2
      RETURNING ReturnID, ReturnNumber, Status
    `, [status, id]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Return not found' });
        }

        // --- Handle Inventory & Balance Update on APPROVAL ---
        if (status === 'APPROVED' && oldStatus !== 'APPROVED') {
            // Fetch items with Product & Unit details for conversion
            const itemsRes = await client.query(`
                SELECT 
                    ri.*,
                    p.ProductName, p.Size, p.PrimaryUnitID,
                    u.UnitCode,
                    pu.UnitCode as PrimaryUnitCode
                FROM ReturnItems ri
                JOIN Products p ON ri.ProductID = p.ProductID
                LEFT JOIN Units u ON ri.UnitID = u.UnitID
                LEFT JOIN Units pu ON p.PrimaryUnitID = pu.UnitID
                WHERE ri.ReturnID = $1
            `, [id]);

            // Get Warehouse ID from Order (if exists) or default to 1
            const returnInfo = await client.query(`
                SELECT r.OrderID, r.ReturnNumber, o.WarehouseID, 
                       COALESCE(c.CustomerName, r.ClientName) as CustomerName,
                       c.CustomerType
                FROM Returns r 
                LEFT JOIN Orders o ON r.OrderID = o.OrderID
                LEFT JOIN Customers c ON r.CustomerID = c.CustomerID
                WHERE r.ReturnID = $1
            `, [id]);

            const warehouseId = returnInfo.rows[0]?.warehouseid || 1;
            const customerName = returnInfo.rows[0]?.customername || 'Client';
            const customerType = returnInfo.rows[0]?.customertype;
            const isRetailCustomer = customerType === 'RETAIL';

            // Helper for dimensions (e.g. "60x60") -> SQM per piece
            const parseDimensions = (str) => {
                if (!str) return 0;
                const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
                if (match) {
                    return (parseInt(match[1]) * parseInt(match[2])) / 10000;
                }
                return 0;
            };

            for (const item of itemsRes.rows) {
                let qtyToRestock = parseFloat(item.quantity) || 0;

                // --- UNIT CONVERSION LOGIC ---
                const isSoldInPieces = item.unitcode === 'PCS';
                const sqmPerPiece = parseDimensions(item.size || item.productname);

                if (isSoldInPieces && sqmPerPiece > 0) {
                    const convertedQty = qtyToRestock * sqmPerPiece;
                    console.log(`[Return] Converting ${qtyToRestock} PCS of ${item.productname} to ${convertedQty.toFixed(4)} SQM`);
                    qtyToRestock = convertedQty;
                }

                // Adjust inventory - add stock back
                const invCheck = await client.query(`
                    SELECT InventoryID FROM Inventory 
                    WHERE ProductID = $1 AND WarehouseID = $2
                 `, [item.productid, warehouseId]);

                if (invCheck.rows.length > 0) {
                    await client.query(`
                        UPDATE Inventory 
                        SET QuantityOnHand = QuantityOnHand + $1, UpdatedAt = CURRENT_TIMESTAMP
                        WHERE ProductID = $2 AND WarehouseID = $3
                     `, [qtyToRestock, item.productid, warehouseId]);
                } else {
                    await client.query(`
                        INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, QuantityReserved)
                        VALUES ($1, $2, 'OWNED', $3, 0)
                     `, [item.productid, warehouseId, qtyToRestock]);
                }

                await client.query(`
                    INSERT INTO InventoryTransactions 
                    (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes)
                    VALUES ($1, $2, 'IN', $3, 'RETURN', $4, $5)
                 `, [item.productid, warehouseId, qtyToRestock, id, `Return Approved ${returnNumber}`]);
            }

            // --- Record RETOUR_VENTE cash transaction ---
            if (totalAmount > 0) {
                await accountingService.recordSaleReturnTransaction({
                    amount: totalAmount,
                    customerName: customerName,
                    orderNumber: returnNumber,
                    orderId: id,
                    userId: req.user?.userId
                }, client);
            }

            // --- Update Customer Balance (reduce debt) ---
            // Only for wholesale customers with a registered CustomerID
            if (customerId && !isRetailCustomer && totalAmount > 0) {
                await client.query(
                    'UPDATE Customers SET CurrentBalance = CurrentBalance - $1, UpdatedAt = NOW() WHERE CustomerID = $2',
                    [totalAmount, customerId]
                );
                console.log(`[Return] Reduced customer ${customerId} balance by ${totalAmount}`);
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Status updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in updateReturnStatus:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    } finally {
        client.release();
    }
};

/**
 * DELETE /returns/:id
 * Delete a pending return (and revert stock adjustments)
 */
const deleteReturn = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        // Check if return exists and is PENDING
        const checkResult = await client.query(`
      SELECT ReturnID, Status, ReturnNumber FROM Returns WHERE ReturnID = $1
    `, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Return not found' });
        }

        if (checkResult.rows[0].status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Only PENDING returns can be deleted'
            });
        }

        await client.query('BEGIN');

        // For PENDING returns, NO inventory revert is needed because we didn't add it yet
        // (Inventory added only on APPROVE)

        // If we ever allow deleting APPROVED returns, we would need revert logic here.
        // But for now, user can only delete PENDING.

        /* 
           REMOVED REVERT LOGIC 
           because updateReturnStatus handles addition on APPROVAL, 
           and deleteReturn only allows PENDING (which haven't touched inventory yet).
        */

        // Delete return (cascade will delete items)
        await client.query('DELETE FROM Returns WHERE ReturnID = $1', [id]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Return deleted and inventory reverted'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in deleteReturn:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    } finally {
        client.release();
    }
};

module.exports = {
    getReturns,
    getReturnById,
    createReturn,
    updateReturnStatus,
    deleteReturn
};

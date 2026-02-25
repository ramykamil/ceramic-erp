const pool = require('../../../config/database');
const pricingService = require('../services/pricing.service');
const accountingService = require('../services/accounting.service');
const auditService = require('../../../services/audit.service');

/**
 * Get all orders with pagination and filtering
 * SALES_RETAIL and SALES_WHOLESALE users only see their own orders
 * ADMIN and MANAGER users see all orders
 * Supports server-side search by OrderNumber, CustomerName, RetailClientName
 */
async function getOrders(req, res, next) {
  try {
    const { page = 1, limit = 200, status, customerId, orderType, salesPersonId, search } = req.query;
    const offset = (page - 1) * limit;

    let baseQuery = `
      FROM Orders o
      LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
      LEFT JOIN Users u ON o.SalesPersonID = u.UserID
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by salesperson for SALES roles (not ADMIN or MANAGER)
    // SALES_WHOLESALE can see all orders (retail + wholesale)
    // SALES_RETAIL can only see their own orders
    const userRole = req.user?.role;
    if (userRole === 'SALES_RETAIL') {
      // Retail users only see their own orders
      baseQuery += ` AND o.SalesPersonID = $${paramIndex++}`;
      params.push(req.user.userId);
    } else if (userRole === 'SALES') {
      // Generic SALES role sees only their own orders
      baseQuery += ` AND o.SalesPersonID = $${paramIndex++}`;
      params.push(req.user.userId);
    } else if (salesPersonId) {
      // Admin/Manager/Wholesale can filter by specific salesperson
      baseQuery += ` AND o.SalesPersonID = $${paramIndex++}`;
      params.push(salesPersonId);
    }
    // SALES_WHOLESALE, ADMIN, MANAGER see all orders (no SalesPersonID filter)

    if (status) {
      baseQuery += ` AND o.Status = $${paramIndex++}`;
      params.push(status);
    }

    if (customerId) {
      baseQuery += ` AND o.CustomerID = $${paramIndex++}`;
      params.push(customerId);
    }

    if (orderType) {
      if (orderType === 'GROS') {
        baseQuery += ` AND (o.OrderType = 'WHOLESALE' OR o.OrderType = 'CONSIGNMENT')`;
      } else if (orderType === 'RETAIL') {
        baseQuery += ` AND (o.OrderType = 'RETAIL')`;
      } else {
        baseQuery += ` AND o.OrderType = $${paramIndex++}`;
        params.push(orderType);
      }
    }

    // Server-side search by OrderNumber, CustomerName, or RetailClientName
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      baseQuery += ` AND (o.OrderNumber ILIKE $${paramIndex} OR c.CustomerName ILIKE $${paramIndex} OR o.RetailClientName ILIKE $${paramIndex})`;
      paramIndex++;
      params.push(searchPattern);
    }

    // Count query for proper pagination total
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countParams = [...params];

    // Data query
    let dataQuery = `
      SELECT 
        o.*,
        c.CustomerName,
        c.CustomerCode,
        u.Username as SalesPersonName,
        o.SalesPersonID as salespersonid,
        COALESCE((
          SELECT SUM(
            CASE 
              WHEN oi.CostPrice > 0 THEN oi.LineTotal - (oi.Quantity * oi.CostPrice)
              ELSE oi.LineTotal * 0.30
            END
          )
          FROM OrderItems oi
          WHERE oi.OrderID = o.OrderID
        ), 0) as benefice
      ${baseQuery}
      ORDER BY o.OrderDate DESC, o.CreatedAt DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, countParams),
      pool.query(dataQuery, params)
    ]);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single order by ID with items
 */
async function getOrderById(req, res, next) {
  try {
    const { id } = req.params;

    const orderQuery = `
      SELECT 
        o.*,
        c.CustomerName,
        c.CustomerCode,
        c.CustomerType,
        c.CurrentBalance,
        w.WarehouseName,
        u.Username as SalesPersonName
      FROM Orders o
      LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
      LEFT JOIN Warehouses w ON o.WarehouseID = w.WarehouseID
      LEFT JOIN Users u ON o.SalesPersonID = u.UserID
      WHERE o.OrderID = $1
    `;

    const itemsQuery = `
      SELECT 
        oi.*,
        p.ProductCode,
        COALESCE(oi.LinkProductName, p.ProductName) as ProductName,
        p.QteParColis,
        p.QteColisParPalette,
        u.UnitCode,
        u.UnitName,
        b.BrandName
      FROM OrderItems oi
      JOIN Products p ON oi.ProductID = p.ProductID
      JOIN Units u ON oi.UnitID = u.UnitID
      LEFT JOIN Brands b ON p.BrandID = b.BrandID
      WHERE oi.OrderID = $1
      ORDER BY oi.OrderItemID
    `;

    const [orderResult, itemsResult] = await Promise.all([
      pool.query(orderQuery, [id]),
      pool.query(itemsQuery, [id])
    ]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const order = orderResult.rows[0];
    order.items = itemsResult.rows;

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new order
 */
async function createOrder(req, res, next) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      customerId,
      orderType,
      warehouseId,
      requiredDate,
      orderDate, // NEW
      notes,
      retailClientName,
      shippingAddress, // NEW
      clientPhone,      // NEW
      paymentAmount, // NEW
      paymentMethod  // NEW
    } = req.body;

    // Generate order number
    const orderNumberResult = await client.query(
      "SELECT 'ORD-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('orders_seq')::TEXT, 6, '0') as order_number"
    );
    const orderNumber = orderNumberResult.rows[0].order_number;

    // Create order
    const orderQuery = `
      INSERT INTO Orders (
        OrderNumber, OrderType, CustomerID, WarehouseID, 
        RequiredDate, OrderDate, Notes, SalesPersonID, CreatedBy, RetailClientName,
        ShippingAddress, ClientPhone, PaymentAmount, PaymentMethod
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const orderResult = await client.query(orderQuery, [
      orderNumber,
      orderType,
      customerId,
      warehouseId,
      requiredDate,
      orderDate || new Date(), // Use provided date or valid default
      notes,
      req.user.userId, // Pour SalesPersonID
      req.user.userId, // Pour CreatedBy
      retailClientName || null,
      shippingAddress || null, // NEW
      clientPhone || null,     // NEW
      parseFloat(paymentAmount) || 0, // NEW
      paymentMethod || null            // NEW
    ]);

    // Audit Log
    try {
      await auditService.log(
        req.user ? req.user.userId : null,
        'CREATE_ORDER',
        'Orders',
        orderResult.rows[0].orderid,
        null,
        orderResult.rows[0],
        req.ip,
        req.headers['user-agent']
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: orderResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Add item to order with automatic pricing (Price Waterfall)
 */
async function addOrderItem(req, res, next) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { orderId } = req.params;
    const { productId, quantity, unitId, unitPrice: providedUnitPrice, discountPercent = 0, taxPercent = 0, palletCount: rawPalletCount = 0, colisCount: rawColisCount = 0, productName } = req.body;
    const palletCount = Number(rawPalletCount) || 0;
    const colisCount = Number(rawColisCount) || 0;

    // Get order details
    const orderResult = await client.query(
      'SELECT CustomerID, Status, WarehouseID FROM Orders WHERE OrderID = $1',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }

    if (orderResult.rows[0].status !== 'PENDING') {
      throw new Error('Cannot modify a confirmed order');
    }

    const customerId = orderResult.rows[0].customerid;

    // Get product's purchase price for cost tracking (kept hidden from sales UI)
    const productResult = await client.query(
      'SELECT PurchasePrice, BasePrice FROM Products WHERE ProductID = $1',
      [productId]
    );
    const costPrice = parseFloat(productResult.rows[0]?.purchaseprice) || parseFloat(productResult.rows[0]?.baseprice) || 0;

    // CRITICAL: Use provided unitPrice from POS if available, else use Price Waterfall Logic
    let unitPrice;
    let priceSource = 'POS'; // Default when price is provided from frontend
    if (providedUnitPrice !== undefined && providedUnitPrice !== null && providedUnitPrice > 0) {
      unitPrice = parseFloat(providedUnitPrice);
      priceSource = 'POS';
    } else {
      const priceInfo = await pricingService.getProductPriceForCustomer(productId, customerId);
      if (priceInfo.source === 'NOT_FOUND') {
        throw new Error('No valid price found for this product');
      }
      unitPrice = priceInfo.price;
      priceSource = priceInfo.source;
    }
    const discountAmount = (unitPrice * quantity * discountPercent) / 100;
    const lineTotal = (unitPrice * quantity) - discountAmount;
    const taxAmount = (lineTotal * taxPercent) / 100;
    const finalLineTotal = lineTotal + taxAmount;

    // Insert order item with pallet, carton counts, and cost price
    const itemQuery = `
      INSERT INTO OrderItems (
        OrderID, ProductID, Quantity, UnitID, UnitPrice,
        DiscountPercent, DiscountAmount, TaxPercent, TaxAmount,
        LineTotal, PriceSource, PalletCount, ColisCount, CostPrice, LinkProductName
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const itemResult = await client.query(itemQuery, [
      orderId,
      productId,
      quantity,
      unitId,
      unitPrice,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      finalLineTotal,
      priceSource,
      palletCount,
      colisCount,
      costPrice,
      productName || null // Save custom product name if provided
    ]);

    // Update order totals
    const updateOrderQuery = `
      UPDATE Orders
      SET 
        SubTotal = (SELECT SUM(LineTotal - TaxAmount) FROM OrderItems WHERE OrderID = $1),
        TaxAmount = (SELECT SUM(TaxAmount) FROM OrderItems WHERE OrderID = $1),
        TotalAmount = (SELECT SUM(LineTotal) FROM OrderItems WHERE OrderID = $1),
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE OrderID = $1
      RETURNING *
    `;

    const updatedOrder = await client.query(updateOrderQuery, [orderId]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Item added to order successfully',
      data: {
        item: itemResult.rows[0],
        priceSource: priceSource,
        order: updatedOrder.rows[0]
      }
    });

    // Fetch product details for unit conversion
    const productRes = await client.query(`
      SELECT p.ProductName, p.ProductCode, p.Size, p.PrimaryUnitID, u.UnitCode as PrimaryUnitCode
      FROM Products p
      LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
      WHERE p.ProductID = $1
    `, [productId]);

    if (productRes.rows.length > 0) {
      const product = productRes.rows[0];

      // SKIP INVENTORY FOR MANUAL PRODUCTS
      if (product.productcode === 'MANUAL') {
        // Do not reserve inventory for manual products
        console.log('Skipping inventory reservation for MANUAL product');
      } else {

        // Fetch Unit Code for the item
        const unitRes = await client.query('SELECT UnitCode FROM Units WHERE UnitID = $1', [unitId]);
        const unitCode = unitRes.rows.length > 0 ? unitRes.rows[0].unitcode : 'PCS';

        // Parse Dimensions Helper
        const parseDimensions = (str) => {
          if (!str) return 0;
          const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
          if (match) {
            return (parseInt(match[1]) * parseInt(match[2])) / 10000; // cm*cm / 10000 = m2
          }
          return 0;
        };

        let qtyToReserve = parseFloat(quantity) || 0;

        // UNIT CONVERSION LOGIC (Same as finalizeOrder)
        const isSoldInPieces = unitCode === 'PCS';
        const isPrimarySqm = product.primaryunitcode === 'SQM' || product.primaryunitcode === 'M2';
        const sqmPerPiece = parseDimensions(product.size || product.productname);

        if (isSoldInPieces && sqmPerPiece > 0) {
          qtyToReserve = qtyToReserve * sqmPerPiece;
        }

        const warehouseId = orderResult.rows[0].warehouseid || 1;

        // Update Inventory Reserved
        // CRITICAL: Check for negative stock / availability BEFORE reserving
        const inventoryCheck = await client.query('SELECT QuantityOnHand, QuantityReserved FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2', [productId, warehouseId]);

        let currentOnHand = 0;
        let currentReserved = 0;

        if (inventoryCheck.rows.length > 0) {
          currentOnHand = parseFloat(inventoryCheck.rows[0].quantityonhand);
          currentReserved = parseFloat(inventoryCheck.rows[0].quantityreserved);
        }

        const available = currentOnHand - currentReserved;
        if (qtyToReserve > available) {
          throw new Error(`Stock insuffisant. Disponible: ${available.toFixed(2)}, Demandé: ${qtyToReserve.toFixed(2)}`);
        }

        await client.query(`
            UPDATE Inventory 
            SET QuantityReserved = QuantityReserved + $1,
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE ProductID = $2 AND WarehouseID = $3
        `, [qtyToReserve, productId, warehouseId]);
      } // End else (not MANUAL)
    }
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Update order status
 */
async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const query = `
      UPDATE Orders
      SET Status = $1, UpdatedAt = CURRENT_TIMESTAMP
      WHERE OrderID = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Finalize order and record accounting transactions (VENTE + VERSEMENT)
 * Called after all items are added to create cash transactions
 */
async function finalizeOrder(req, res, next) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { orderId } = req.params;
    // Use body payment or fallback to stored payment in order
    // We fetch order first to get stored payment
    let { paymentAmount, paymentMethod } = req.body;

    // Get order with customer info
    const orderResult = await client.query(`
      SELECT o.*, c.CustomerName, c.CustomerType 
      FROM Orders o 
      LEFT JOIN Customers c ON o.CustomerID = c.CustomerID 
      WHERE o.OrderID = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      throw new Error('Commande non trouvée');
    }

    const order = orderResult.rows[0];
    const totalAmount = parseFloat(order.totalamount) || 0;

    if (totalAmount <= 0) {
      throw new Error('Le montant de la commande doit être supérieur à 0');
    }

    // Use stored payment if not provided in body
    if (paymentAmount === undefined && order.paymentamount !== null) {
      paymentAmount = parseFloat(order.paymentamount);
    } else {
      paymentAmount = parseFloat(paymentAmount) || 0;
    }

    if (!paymentMethod && order.paymentmethod) {
      paymentMethod = order.paymentmethod;
    }
    paymentMethod = paymentMethod || 'ESPECE';

    // Check if this is a retail order (cash sale - no balance tracking)
    // Retail orders don't affect customer balance as they are POS cash sales
    const isRetailOrder = order.ordertype === 'RETAIL' || order.customertype === 'RETAIL';

    // 1. Record VENTE transaction (the sale amount)
    await accountingService.recordSaleTransaction({
      amount: totalAmount,
      customerName: order.customername,
      orderNumber: order.ordernumber,
      orderId: order.orderid,
      userId: req.user?.userId
    }, client);

    // 2. If there's a payment, record VERSEMENT transaction
    const payment = parseFloat(paymentAmount) || 0;
    if (payment > 0) {
      await accountingService.recordPaymentTransaction({
        amount: payment,
        customerName: order.customername,
        orderNumber: order.ordernumber,
        orderId: order.orderid,
        userId: req.user?.userId,
        type: 'VERSEMENT',
        paymentMethod: paymentMethod // ESPECE, VIREMENT, CHEQUE
      }, client);

      // Only update customer balance for WHOLESALE orders (not retail)
      if (!isRetailOrder) {
        // Update customer balance (reduce by payment amount)
        await client.query(
          'UPDATE Customers SET CurrentBalance = CurrentBalance - $1 WHERE CustomerID = $2',
          [payment, order.customerid]
        );
      }
    }

    // Update customer balance (add the unpaid portion) - ONLY for wholesale
    const unpaidAmount = totalAmount - payment;
    if (unpaidAmount > 0 && !isRetailOrder) {
      await client.query(
        'UPDATE Customers SET CurrentBalance = CurrentBalance + $1 WHERE CustomerID = $2',
        [unpaidAmount, order.customerid]
      );
    }

    // Update order status to CONFIRMED
    await client.query(
      "UPDATE Orders SET Status = 'CONFIRMED', UpdatedAt = CURRENT_TIMESTAMP WHERE OrderID = $1",
      [orderId]
    );

    // Helper to parse dimensions (e.g. "60x60") and return SQM per piece
    const parseDimensions = (str) => {
      if (!str) return 0;
      const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
      if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000; // cm*cm / 10000 = m2
      }
      return 0;
    };

    // ===== INVENTORY DEDUCTION =====
    // Get all order items with product details for unit conversion
    const itemsResult = await client.query(`
      SELECT 
        oi.ProductID, oi.Quantity, oi.PalletCount, oi.ColisCount, 
        u.UnitCode,
        p.ProductName, p.Size, p.PrimaryUnitID,
        pu_p.UnitCode as PrimaryUnitCode
      FROM OrderItems oi
      LEFT JOIN Units u ON oi.UnitID = u.UnitID
      JOIN Products p ON oi.ProductID = p.ProductID
      LEFT JOIN Units pu_p ON p.PrimaryUnitID = pu_p.UnitID
      WHERE oi.OrderID = $1
    `, [orderId]);

    // Get warehouse from order (default to 1 if not specified)
    const warehouseId = order.warehouseid || 1;

    // Deduct inventory for each item
    for (const item of itemsResult.rows) {
      let qtyToDeduct = parseFloat(item.quantity) || 0;

      // UNIT CONVERSION LOGIC
      // If sold in PCS but Primary Unit is SQM (common for tiles), convert PCS -> SQM
      // We detect "SQM" primary unit explicitly, OR infer from dimensions if primary unit is missing/ambiguous
      const isSoldInPieces = item.unitcode === 'PCS';
      const isPrimarySqm = item.primaryunitcode === 'SQM' || item.primaryunitcode === 'M2';

      const sqmPerPiece = parseDimensions(item.size || item.productname);

      if (isSoldInPieces && sqmPerPiece > 0) {
        // Cases:
        // 1. Primary is SQM: We conversion is mandatory.
        // 2. Primary is PCS (Misconfiguration): User stores Stock in SQM but Primary is PCS (Product 309 case).
        //    We MUST convert to SQM to match the actual Inventory numbers convention.
        // 3. Product is Tile (has dimensions): Always track in SQM.

        // Force conversion for ANY tile product sold in pieces
        const convertedQty = qtyToDeduct * sqmPerPiece;
        console.log(`[Inventory] Converting ${qtyToDeduct} PCS of ${item.productname} to ${convertedQty.toFixed(4)} SQM`);
        qtyToDeduct = convertedQty;
      }

      // Update inventory quantities
      // Reduce BOTH QuantityOnHand and QuantityReserved since the order is now confirmed/sold
      // NOTE: QuantityReserved was increased when item was added (addOrderItem).
      // So now we decrease it, and also decrease OnHand.
      await client.query(`
        UPDATE Inventory 
        SET QuantityOnHand = GREATEST(0, QuantityOnHand - $1),
            QuantityReserved = GREATEST(0, QuantityReserved - $1),
            PalletCount = GREATEST(0::numeric, COALESCE(PalletCount, 0::numeric) - COALESCE($2::numeric, 0::numeric)),
            ColisCount = GREATEST(0::numeric, COALESCE(ColisCount, 0::numeric) - COALESCE($3::numeric, 0::numeric)),
            UpdatedAt = CURRENT_TIMESTAMP
        WHERE ProductID = $4 AND WarehouseID = $5
      `, [qtyToDeduct, Number(item.palletcount) || 0, Number(item.coliscount) || 0, item.productid, warehouseId]);

      // Record inventory transaction for audit trail
      await client.query(`
        INSERT INTO InventoryTransactions 
        (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes, CreatedBy, CreatedAt)
        VALUES ($1, $2, 'OUT', $3, 'ORDER', $4, $5, $6, CURRENT_TIMESTAMP)
      `, [item.productid, warehouseId, item.quantity, orderId, `Vente ${order.ordernumber}`, req.user?.userId || 1]);
    }

    // Audit Log for Sale
    try {
      const auditAction = (paymentAmount >= (parseFloat(order.totalamount) || 0)) ? 'SALE_COMPLETED' : 'SALE_PARTIAL';
      await auditService.log(
        req.user ? req.user.userId : null,
        auditAction,
        'Orders',
        orderId,
        null, // Old values
        { ...order, paymentAmount, paymentMethod }, // New values
        req.ip,
        req.headers['user-agent']
      );
    } catch (auditErr) {
      console.error('Audit log failed during finalize:', auditErr);
    }

    await client.query('COMMIT');

    // Refresh materialized view to update stock in catalogue/POS/purchasing
    try {
      await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
    } catch (refreshError) {
      console.log('Note: mv_Catalogue refresh skipped:', refreshError.message);
    }

    res.json({
      success: true,
      message: 'Vente enregistrée avec succès',
      data: {
        orderNumber: order.ordernumber,
        totalAmount,
        paymentAmount: payment,
        remainingBalance: unpaidAmount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error finalizing order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la finalisation de la commande'
    });
  } finally {
    client.release();
  }
}



/**
 * PUT /orders/:id
 * Update an existing PENDING or CONFIRMED order.
 * - If PENDING: Reverts reserved inventory covers.
 * - If CONFIRMED: Reverts SOLD inventory (OnHand), FINANCIALS, and resets status to PENDING.
 * Non-admin/manager users can only update their own orders.
 */
const updateOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { customerId, items, paymentAmount, paymentMethod, notes, deliveryCost, discount, timber, orderDate } = req.body;

    await client.query('BEGIN');

    // 1. Check if order exists
    const checkRes = await client.query('SELECT * FROM Orders WHERE OrderID = $1', [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = checkRes.rows[0];

    // Ownership check
    const userRole = req.user?.role;
    const userId = req.user?.userId;
    const hasFullAccess = userRole === 'ADMIN' || userRole === 'MANAGER' || userRole === 'SALES_WHOLESALE';
    const isOwner = order.createdby === userId || order.salespersonid === userId;

    if (!hasFullAccess && !isOwner) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Vous ne pouvez modifier que vos propres commandes' });
    }

    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED' && order.status !== 'DELIVERED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Seules les commandes en attente, confirmées ou livrées peuvent être modifiées' });
    }

    // Helper to parse dimensions (e.g. "60x60") -> m2
    const parseDimensions = (str) => {
      if (!str) return 0;
      const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
      if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
      }
      return 0;
    };

    // 2. REVERT LOGIC (Inventory & Financials)

    // 2a. Revert Inventory
    // Fetch old items with product details for unit conversion
    const oldItemsRes = await client.query(`
        SELECT oi.*, p.ProductName, p.Size, u.UnitCode 
        FROM OrderItems oi
        JOIN Products p ON oi.ProductID = p.ProductID
        LEFT JOIN Units u ON oi.UnitID = u.UnitID
        WHERE oi.OrderID = $1
    `, [id]);

    for (const item of oldItemsRes.rows) {
      const qty = parseFloat(item.quantity);

      if (order.status === 'PENDING') {
        // PENDING: Simply un-reserve
        await client.query(`
          UPDATE Inventory 
          SET QuantityReserved = GREATEST(0, QuantityReserved - $1)
          WHERE ProductID = $2 AND WarehouseID = 1
        `, [qty, item.productid]);
      } else if (order.status === 'CONFIRMED' || order.status === 'DELIVERED') {
        // CONFIRMED/DELIVERED: Item was SOLD (Deducted from OnHand). Add it back to OnHand.
        // Must handle Unit Conversion (PCS -> SQM) same as finalizeOrder
        let qtyToAddBack = qty;
        const sqmPerPiece = parseDimensions(item.size || item.productname);

        if (item.unitcode === 'PCS' && sqmPerPiece > 0) {
          qtyToAddBack = qty * sqmPerPiece;
        }

        await client.query(`
          UPDATE Inventory 
          SET QuantityOnHand = QuantityOnHand + $1
          WHERE ProductID = $2 AND WarehouseID = 1
        `, [qtyToAddBack, item.productid]);
      }
    }

    // 2b. Revert Financials (CONFIRMED Only)
    if (order.status === 'CONFIRMED' || order.status === 'DELIVERED') {
      // Reverse Customer Balance Update (Wholesale only)
      const isRetailOrder = order.ordertype === 'RETAIL'; // or check CustomerType? finalizeOrder checks logic
      // Note: finalizeOrder logic was: Balance -= Payment; Balance += Unpaid;
      // So we Reverse: Balance += Payment; Balance -= Unpaid;

      if (!isRetailOrder && order.customerid) {
        const oldTotal = parseFloat(order.totalamount) || 0;
        const oldPayment = parseFloat(order.paymentamount) || 0;
        const oldUnpaid = oldTotal - oldPayment;

        if (oldPayment > 0) {
          await client.query('UPDATE Customers SET CurrentBalance = CurrentBalance + $1 WHERE CustomerID = $2', [oldPayment, order.customerid]);
        }
        if (oldUnpaid > 0) {
          await client.query('UPDATE Customers SET CurrentBalance = CurrentBalance - $1 WHERE CustomerID = $2', [oldUnpaid, order.customerid]);
        }
      }

      // Reverse Cash Transactions
      // Find transactions linked to this order
      const transRes = await client.query('SELECT TransactionID, AccountID, Amount, TransactionType FROM CashTransactions WHERE ReferenceID = $1 AND ReferenceType = \'ORDER\'', [id]);
      for (const trans of transRes.rows) {
        // Revert Account Balance
        // If VENTE (+Amount to Account) -> Decrease Balance
        // If VERSEMENT (+Amount to Account) -> Decrease Balance
        // If RETOUR (-Amount to Account) -> Increase Balance

        if (trans.transactiontype === 'VENTE' || trans.transactiontype === 'VERSEMENT') {
          await client.query('UPDATE CashAccounts SET Balance = Balance - $1 WHERE AccountID = $2', [trans.amount, trans.accountid]);
        } else if (trans.transactiontype === 'RETOUR_VENTE') {
          await client.query('UPDATE CashAccounts SET Balance = Balance + $1 WHERE AccountID = $2', [trans.amount, trans.accountid]);
        }

        // Delete Transaction
        await client.query('DELETE FROM CashTransactions WHERE TransactionID = $1', [trans.transactionid]);
      }
    }

    // 3. Delete OLD items
    await client.query('DELETE FROM OrderItems WHERE OrderID = $1', [id]);

    // 4. Update Order Header AND RESET STATUS TO PENDING
    // Recalculate totals
    let subtotal = 0;
    // items is array from body
    const delivery = parseFloat(deliveryCost) || 0;
    const disc = parseFloat(discount) || 0;
    const timb = parseFloat(timber) || 0;

    // We need to loop items to calculate subtotal (using unitPrice from payload)
    for (const item of items) {
      subtotal += (Number(item.quantity) * Number(item.unitPrice));
    }

    const taxAmount = 0; // Assuming 0 for now as per previous code
    const totalAmount = subtotal + taxAmount + delivery + timb - disc;

    // Force Status = PENDING
    await client.query(`
            UPDATE Orders 
            SET CustomerID = $1, TotalAmount = $2, PaymentAmount = $3, PaymentMethod = $4, Notes = $5, DeliveryCost = $6, Discount = $7, Timber = $8, OrderDate = COALESCE($9, OrderDate), 
            ShippingAddress = $10, ClientPhone = $11,
            Status = 'PENDING', UpdatedAt = CURRENT_TIMESTAMP
            WHERE OrderID = $12
        `, [
      customerId || null,
      totalAmount,
      paymentAmount || 0,
      paymentMethod || 'ESPECE',
      notes,
      delivery,
      disc,
      timb,
      orderDate,
      req.body.shippingAddress || null,
      req.body.clientPhone || null,
      id
    ]);

    // 5. Insert NEW items and Reserve Inventory
    // Note: We always Reserve (Status is PENDING now). 
    // User must click Confirm again to finalize/deduct stock.
    for (const item of items) {
      const lineTotal = Number(item.quantity) * Number(item.unitPrice);

      // Get product's purchase price for cost tracking
      const productRes = await client.query(
        'SELECT PurchasePrice, BasePrice FROM Products WHERE ProductID = $1',
        [item.productId]
      );
      const costPrice = parseFloat(productRes.rows[0]?.purchaseprice) || parseFloat(productRes.rows[0]?.baseprice) || 0;

      // Insert Item with CostPrice
      await client.query(`
                INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice, LineTotal, UnitID, PalletCount, ColisCount, CostPrice)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [id, item.productId, item.quantity, item.unitPrice, lineTotal, item.unitId, Math.floor(Number(item.palettes) || 0), Math.floor(Number(item.cartons) || 0), costPrice]);

      // Reserve Inventory
      // Assuming Warehouse 1
      // Check if inventory record exists
      const invCheck = await client.query('SELECT InventoryID FROM Inventory WHERE ProductID = $1 AND WarehouseID = 1', [item.productId]);

      if (invCheck.rows.length > 0) {
        await client.query(`
            UPDATE Inventory 
            SET QuantityReserved = QuantityReserved + $1,
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE ProductID = $2 AND WarehouseID = 1
          `, [item.quantity, item.productId]);
      } else {
        // Create inventory record if missing (should exist if product exists, but safety check)
        await client.query(`
            INSERT INTO Inventory (ProductID, WarehouseID, QuantityReserved, QuantityOnHand)
            VALUES ($1, 1, $2, 0)
          `, [item.productId, item.quantity]);
      }

      // We do NOT deduct QuantityOnHand here because status is PENDING.
    }

    await client.query('COMMIT');

    // Return success
    res.json({
      success: true,
      message: 'Commande mise à jour avec succès (Statut remis en ATTENTE)',
      orderId: id
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};

/**
 * Update order financials (Delivery, Discount, etc) without replacing items
 */
async function updateOrderFinancials(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { deliveryCost, discount, timber, notes, paymentAmount, paymentMethod } = req.body;

    await client.query('BEGIN');

    // Get current items total
    const result = await client.query('SELECT SUM(LineTotal) as itemstotal FROM OrderItems WHERE OrderID = $1', [id]);
    const itemsTotal = parseFloat(result.rows[0]?.itemstotal || 0);

    const delivery = parseFloat(deliveryCost) || 0;
    const disc = parseFloat(discount) || 0;
    const timb = parseFloat(timber) || 0;

    const totalAmount = itemsTotal + delivery + timb - disc;

    // Update Order
    await client.query(`
      UPDATE Orders 
      SET 
        TotalAmount = $1,
        PaymentAmount = $2,
        PaymentMethod = $3,
        Notes = $4,
        DeliveryCost = $5,
        Discount = $6,
        Timber = $7,
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE OrderID = $8
    `, [totalAmount, parseFloat(paymentAmount) || 0, paymentMethod, notes, delivery, disc, timb, id]);

    // If order is CONFIRMED, we might need to update Accounting?
    // For now assuming this is called during creation/draft phase.

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Financials updated',
      data: { totalAmount, delivery, discount: disc, timber: timb }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Delete an order (only PENDING orders)
 * Non-admin/manager users can only delete their own orders.
 */
async function deleteOrder(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    // Check order status and get ownership info
    const orderRes = await client.query('SELECT Status, WarehouseID, CreatedBy, SalesPersonID FROM Orders WHERE OrderID = $1', [id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = orderRes.rows[0];

    // Ownership check: ADMIN/MANAGER/SALES_WHOLESALE can delete any order, others can only delete their own
    const userRole = req.user?.role;
    const userId = req.user?.userId;
    const hasFullAccess = userRole === 'ADMIN' || userRole === 'MANAGER' || userRole === 'SALES_WHOLESALE';
    const isOwner = order.createdby === userId || order.salespersonid === userId;

    if (!hasFullAccess && !isOwner) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Vous ne pouvez supprimer que vos propres commandes' });
    }

    if (order.status !== 'PENDING') {
      throw new Error('Only PENDING orders can be deleted');
    }

    // Find items to release reserved stock
    const itemsRes = await client.query(`
        SELECT oi.*, p.ProductName, p.Size, p.PrimaryUnitID, pu_p.UnitCode as PrimaryUnitCode, u.UnitCode
        FROM OrderItems oi
        JOIN Products p ON oi.ProductID = p.ProductID
        LEFT JOIN Units pu_p ON p.PrimaryUnitID = pu_p.UnitID
        LEFT JOIN Units u ON oi.UnitID = u.UnitID
        WHERE oi.OrderID = $1
    `, [id]);

    const warehouseId = order.warehouseid || 1;

    // Release Reserved Stock
    for (const item of itemsRes.rows) {
      let qtyToRelease = parseFloat(item.quantity) || 0;

      // Duplicate Unit Conversion Logic (Need a shared helper really, but for now inline)
      const parseDimensions = (str) => {
        if (!str) return 0;
        const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
        if (match) return (parseInt(match[1]) * parseInt(match[2])) / 10000;
        return 0;
      };
      const isSoldInPieces = item.unitcode === 'PCS';
      const sqmPerPiece = parseDimensions(item.size || item.productname);
      if (isSoldInPieces && sqmPerPiece > 0) {
        qtyToRelease = qtyToRelease * sqmPerPiece;
      }

      await client.query(`
            UPDATE Inventory SET QuantityReserved = GREATEST(0, QuantityReserved - $1)
            WHERE ProductID = $2 AND WarehouseID = $3
        `, [qtyToRelease, item.productid, warehouseId]);
    }

    // Delete items (Cascade should handle it, but good to be explicit or rely on cascade)
    // Constraint `fk_orderitem_order` has `ON DELETE CASCADE` in schema?
    // Let's check schema: `OrderID INT REFERENCES Orders(OrderID) ON DELETE CASCADE`. Yes.

    // Delete Order
    await client.query('DELETE FROM Orders WHERE OrderID = $1', [id]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Order deleted and reserved stock released' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  addOrderItem,
  updateOrderStatus,
  finalizeOrder,
  updateOrder,
  updateOrderFinancials,
  deleteOrder
};


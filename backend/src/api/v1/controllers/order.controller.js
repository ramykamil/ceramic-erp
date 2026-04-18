const pool = require('../../../config/database');
const pricingService = require('../services/pricing.service');
const accountingService = require('../services/accounting.service');
const auditService = require('../../../services/audit.service');

// ===== UNIT CONVERSION HELPERS =====
const parseSqmPerPiece = (str) => {
  if (!str) return 0;
  const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
  if (match) {
    return (parseInt(match[1]) * parseInt(match[2])) / 10000; // cm*cm / 10000 = m2
  }
  return 0;
};

/**
 * Helper to identify service items (Transport, Fiche) that don't track physical stock
 */
const isServiceItem = (name) => {
  const n = (name || '').toLowerCase();
  return n.includes('transport') || n.includes('fiche');
};

const convertUnitToInventory = (qty, cartUnitCode, primaryUnitCode, sqmPerPiece, productName, qteParColis = 0) => {
  let finalQty = parseFloat(qty) || 0;
  
  // Identify service items (Fiche)
  const isFicheProduct = (productName || '').toLowerCase().startsWith('fiche');
  if (isFicheProduct) return finalQty;

  // TILE PRODUCT LOGIC: If it has dimensions, inventory is ALWAYS in SQM
  // regardless of what primaryUnitCode says (matches GoodsReceipt convention)
  if (sqmPerPiece > 0) {
    const isCartSqm = ['SQM', 'M2', 'M²'].includes(cartUnitCode);
    const isCartPcs = ['PCS', 'PIECE', 'PIÈCH'].includes(cartUnitCode);
    const isCartBox = ['BOX', 'CARTON', 'CRT', 'CTN'].includes(cartUnitCode);

    if (isCartSqm) {
      return finalQty; // Already in SQM
    } else if (isCartPcs) {
      return finalQty * sqmPerPiece; // PCS -> SQM
    } else if (isCartBox && qteParColis > 0) {
      // BOX -> SQM (assuming qteParColis is number of pieces per box)
      // Wait, in many tile products qteParColis is SQM per box. 
      // In the frontend, it depends on the unit.
      // Let's use the safest conversion: BOX -> SQM directly if qteParColis is SQM
      return finalQty * qteParColis; 
    }
    return finalQty;
  }

  // NON-TILE PRODUCT LOGIC
  const isCartPcs = ['PCS', 'PIECE', 'PIÈCE'].includes(cartUnitCode);
  const isPrimaryPcs = (primaryUnitCode === 'PCS' || primaryUnitCode === 'PIECE' || !primaryUnitCode);
  
  if (isCartPcs && isPrimaryPcs) {
    return finalQty;
  }
  
  return finalQty;
};
// ===================================
// ===== INVENTORY VALIDATION HELPER =====
/**
 * Internal helper to check if an order's items have sufficient stock.
 * Used during order creation (optional) and confirmation (mandatory).
 */
const checkOrderStock = async (client, orderId, warehouseId) => {
  // Fetch items and their corresponding product specifications
  const itemsResult = await client.query(`
    SELECT 
      oi.ProductID as productid, 
      oi.Quantity as quantity, 
      u.UnitCode as unitcode,
      p.ProductName as productname, 
      p.ProductCode as productcode, 
      p.Size as size, 
      p.PrimaryUnitID as primaryunitid, 
      p.QteParColis as qteparcolis,
      pu_p.UnitCode as primaryunitcode
    FROM OrderItems oi
    LEFT JOIN Units u ON oi.UnitID = u.UnitID
    JOIN Products p ON oi.ProductID = p.ProductID
    LEFT JOIN Units pu_p ON p.PrimaryUnitID = pu_p.UnitID
    WHERE oi.OrderID = $1
  `, [orderId]);

  if (itemsResult.rows.length === 0) {
    throw new Error('La commande ne contient aucun produit.');
  }

  const effectiveWarehouseId = warehouseId || 1;

  for (const item of itemsResult.rows) {
    const qtyNum = parseFloat(item.quantity) || 0;
    
    // Basic quantity check
    if (qtyNum <= 0) {
      throw new Error(`Le produit "${item.productname}" a une quantité non valide (${item.quantity}). Veuillez corriger avant de valider.`);
    }

    // Skip physical stock check for MANUAL items and SERVICE items (Transport, Fiche)
    if (item.productcode === 'MANUAL' || isServiceItem(item.productname)) {
      continue;
    }

    const sqmPerPiece = parseSqmPerPiece(item.size || item.productname);
    const requiredQty = convertUnitToInventory(
      qtyNum, 
      item.unitcode, 
      item.primaryunitcode, 
      sqmPerPiece, 
      item.productname, 
      parseFloat(item.qteparcolis) || 0
    );

    // Query inventory record (OWNED stock only)
    const inventoryCheck = await client.query(`
      SELECT QuantityOnHand, QuantityReserved 
      FROM Inventory 
      WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED'
    `, [item.productid, effectiveWarehouseId]);

    const onHand = inventoryCheck.rows.length > 0 ? parseFloat(inventoryCheck.rows[0].quantityonhand) : 0;
    
    // Enforcement: Total on hand must meet the required order quantity
    if (onHand < requiredQty) {
       throw new Error(`Stock insuffisant pour "${item.productname}". En stock: ${onHand.toFixed(2)}, Requis: ${requiredQty.toFixed(2)} (Entrepôt: ${effectiveWarehouseId})`);
    }
  }
  return itemsResult;
};

/**
 * Internal helper to deduct inventory items from a specific warehouse.
 * Handles unit conversion and skips service items.
 */
const deductOrderInventory = async (client, items, warehouseId, orderId, orderNumber, userId) => {
  const effectiveWarehouseId = warehouseId || 1;
  const effectiveUserId = userId || 1;
  
  for (const item of items) {
    let qtyToDeduct = parseFloat(item.quantity) || 0;
    
    // Skip inventory deduction for service items (Transport/Fiche)
    if (isServiceItem(item.productname)) {
      console.log(`[Inventory] Skipping deduction for service item: ${item.productname}`);
      continue;
    }

    // Universal UNIT CONVERSION LOGIC (matches checkOrderStock)
    const sqmPerPiece = parseSqmPerPiece(item.size || item.productname);
    const convertedQty = convertUnitToInventory(
      qtyToDeduct, 
      item.unitcode, 
      item.primaryunitcode, 
      sqmPerPiece, 
      item.productname, 
      parseFloat(item.qteparcolis) || 0
    );

    if (convertedQty !== qtyToDeduct) {
      console.log(`[Inventory] Converting ${qtyToDeduct} ${item.unitcode} for deduction to ${convertedQty.toFixed(4)}`);
      qtyToDeduct = convertedQty;
    }

    // 1. Update inventory quantities with safety
    const deductResult = await client.query(`
      UPDATE Inventory 
      SET 
        QuantityOnHand = GREATEST(0, QuantityOnHand - $1),
        QuantityReserved = GREATEST(0, QuantityReserved - $1),
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
      RETURNING QuantityOnHand
    `, [qtyToDeduct, item.productid, effectiveWarehouseId]);

    // 2. Recalculate PalletCount and ColisCount from new total QuantityOnHand
    if (deductResult.rows.length > 0) {
      const newQty = parseFloat(deductResult.rows[0].quantityonhand) || 0;
      const productPkg = await client.query('SELECT QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1', [item.productid]);
      if (productPkg.rows.length > 0) {
        const ppc = parseFloat(productPkg.rows[0].qteparcolis) || 0;
        const cpp = parseFloat(productPkg.rows[0].qtecolisparpalette) || 0;
        const newColis = ppc > 0 ? parseFloat((newQty / ppc).toFixed(4)) : 0;
        const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
        await client.query(`
          UPDATE Inventory 
          SET ColisCount = $1, PalletCount = $2 
          WHERE ProductID = $3 AND WarehouseID = $4 AND OwnershipType = 'OWNED'
        `, [newColis, newPallets, item.productid, effectiveWarehouseId]);
      }
    }

    // 3. Record inventory transaction for audit trail
    await client.query(`
      INSERT INTO InventoryTransactions 
      (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes, CreatedBy, CreatedAt)
      VALUES ($1, $2, 'OUT', $3, 'ORDER', $4, $5, $6, CURRENT_TIMESTAMP)
    `, [item.productid, effectiveWarehouseId, qtyToDeduct, orderId, `Vente ${orderNumber}`, effectiveUserId]);
  }
};
// ===================================

/**
 * Get all orders with pagination and filtering
 * SALES_RETAIL and SALES_WHOLESALE users only see their own orders
 * ADMIN and MANAGER users see all orders
 * Supports server-side search by OrderNumber, CustomerName, RetailClientName
 */
async function getOrders(req, res, next) {
  try {
    const { page = 1, limit = 20000, status, customerId, orderType, salesPersonId, search } = req.query;
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
        o.OrderID as orderid, o.OrderNumber as ordernumber, o.OrderDate as orderdate, o.Status as status,
        o.TotalAmount as totalamount, o.SubTotal as subtotal, o.TaxAmount as taxamount, 
        o.PaymentAmount as paymentamount, o.PaymentMethod as paymentmethod,
        o.OrderType as ordertype, o.Notes as notes, o.CustomerID as customerid,
        o.RetailClientName as retailclientname, o.WarehouseID as warehouseid,
        c.CustomerName as customername,
        c.CustomerCode as customercode,
        u.Username as salespersonname,
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
        ), 0) as profit
      ${baseQuery}
      ORDER BY o.CreatedAt DESC, o.OrderID DESC, o.OrderDate DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}
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
        o.OrderID as orderid, o.OrderNumber as ordernumber, o.OrderDate as orderdate, o.Status as status,
        o.TotalAmount as totalamount, o.SubTotal as subtotal, o.TaxAmount as taxamount, 
        o.DeliveryCost as deliverycost, o.Discount as discount, o.Timber as timber,
        o.PaymentAmount as paymentamount, o.PaymentMethod as paymentmethod,
        o.Notes as notes, o.CustomerID as customerid, o.WarehouseID as warehouseid,
        o.RetailClientName as retailclientname, 
        COALESCE(o.ShippingAddress, c.Address) as clientaddress,
        COALESCE(o.ClientPhone, c.Phone) as clientphone, 
        o.SalesPersonID as salespersonid,
        c.CustomerName as customername,
        c.CustomerCode as customercode,
        c.CustomerType as customertype,
        c.CurrentBalance as currentbalance,
        w.WarehouseName as warehousename,
        u.Username as salespersonname
      FROM Orders o
      LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
      LEFT JOIN Warehouses w ON o.WarehouseID = w.WarehouseID
      LEFT JOIN Users u ON o.SalesPersonID = u.UserID
      WHERE o.OrderID = $1
    `;

    const itemsQuery = `
      SELECT 
        oi.OrderItemID as orderitemid, oi.OrderID as orderid, oi.ProductID as productid,
        oi.Quantity as quantity, oi.UnitID as unitid, oi.UnitPrice as unitprice,
        oi.DiscountPercent as discountpercent, oi.DiscountAmount as discountamount,
        oi.TaxPercent as taxpercent, oi.TaxAmount as taxamount,
        oi.LineTotal as linetotal, oi.PriceSource as pricesource,
        oi.PalletCount as palletcount, oi.ColisCount as coliscount,
        oi.CostPrice as costprice,
        p.ProductCode as productcode,
        COALESCE(oi.LinkProductName, p.ProductName) as productname,
        p.QteParColis as qteparcolis,
        p.QteColisParPalette as qtecolisparpalette,
        p.Size as size,
        u.UnitCode as unitcode,
        u.UnitName as unitname,
        b.BrandName as brandname
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
      paymentMethod,  // NEW
      items           // NEW: Array of items for atomic creation
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

    // --- ATOMIC ITEM INSERTION IF PROVIDED ---
    if (items && Array.isArray(items) && items.length > 0) {
      const orderId = orderResult.rows[0].orderid;
      const effectiveWarehouseId = warehouseId || 1;

      for (const item of items) {
        const { productId, quantity, unitId, unitPrice: providedUnitPrice, discountPercent = 0, taxPercent = 0, palletCount: rawPalletCount = 0, colisCount: rawColisCount = 0, productName } = item;
        
        if (parseFloat(quantity) <= 0) {
          throw new Error(`Le produit "${productName || productId}" a une quantité de 0 ou moins. Veuillez corriger la quantité.`);
        }

        const palletCount = Number(rawPalletCount) || 0;
        const colisCount = Number(rawColisCount) || 0;

        // Get product details
        const productResult = await client.query(
          'SELECT p.PurchasePrice, p.BasePrice, p.ProductName, p.ProductCode, p.Size, p.PrimaryUnitID, p.QteParColis, u.UnitCode as PrimaryUnitCode FROM Products p LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID WHERE p.ProductID = $1',
          [productId]
        );
        const costPrice = parseFloat(productResult.rows[0]?.purchaseprice) || parseFloat(productResult.rows[0]?.baseprice) || 0;
        const product = productResult.rows[0];

        // ═══════════════════════════════════════════════════════════
        // STOCK CHECK — MUST happen BEFORE insert, inside transaction
        // ═══════════════════════════════════════════════════════════
        if (product && product.productcode !== 'MANUAL' && !isServiceItem(product.productname || productName)) {
          const unitRes = await client.query('SELECT UnitCode FROM Units WHERE UnitID = $1', [unitId]);
          const unitCode = unitRes.rows.length > 0 ? unitRes.rows[0].unitcode : 'PCS';

          const sqmPerPiece = parseSqmPerPiece(product.size || product.productname);
          let qtyToReserve = parseFloat(quantity) || 0;

          // Universal UNIT CONVERSION LOGIC
          qtyToReserve = convertUnitToInventory(qtyToReserve, unitCode, product.primaryunitcode, sqmPerPiece, product.productname, parseFloat(product.qteparcolis) || 0);

          // Check stock availability
          const inventoryCheck = await client.query('SELECT QuantityOnHand, QuantityReserved FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = \'OWNED\'', [productId, effectiveWarehouseId]);

          let currentOnHand = 0;
          let currentReserved = 0;

          if (inventoryCheck.rows.length > 0) {
            currentOnHand = parseFloat(inventoryCheck.rows[0].quantityonhand);
            currentReserved = parseFloat(inventoryCheck.rows[0].quantityreserved);
          }

          const available = currentOnHand - currentReserved;
          // Stock constraint removed here to allow creating PENDING orders.
          // The check is instead performed during finalizeOrder.

          // Reserve inventory
          await client.query(`
              UPDATE Inventory 
              SET QuantityReserved = QuantityReserved + $1,
                  UpdatedAt = CURRENT_TIMESTAMP
              WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
          `, [qtyToReserve, productId, effectiveWarehouseId]);
        } else if (product && product.productcode === 'MANUAL') {
          console.log('Skipping inventory reservation for MANUAL product');
        }

        // ═══════════════════════════════════════════════════════════
        // PRICING — Price Waterfall Logic
        // ═══════════════════════════════════════════════════════════
        let unitPrice;
        let priceSource = 'POS';
        if (providedUnitPrice !== undefined && providedUnitPrice !== null && providedUnitPrice > 0) {
          unitPrice = parseFloat(providedUnitPrice);
          priceSource = 'POS';
        } else {
          const priceInfo = await pricingService.getProductPriceForCustomer(productId, customerId);
          if (priceInfo.source === 'NOT_FOUND') {
            throw new Error('No valid price found for this product: ' + product?.productname);
          }
          unitPrice = priceInfo.price;
          priceSource = priceInfo.source;
        }

        const discountAmount = (unitPrice * quantity * discountPercent) / 100;
        const lineTotal = (unitPrice * quantity) - discountAmount;
        const taxAmount = (lineTotal * taxPercent) / 100;
        const finalLineTotal = lineTotal + taxAmount;

        const itemQuery = `
          INSERT INTO OrderItems (
            OrderID, ProductID, Quantity, UnitID, UnitPrice,
            DiscountPercent, DiscountAmount, TaxPercent, TaxAmount,
            LineTotal, PriceSource, PalletCount, ColisCount, CostPrice, LinkProductName
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `;

        await client.query(itemQuery, [
          orderId, productId, quantity, unitId, unitPrice, discountPercent, discountAmount,
          taxPercent, taxAmount, finalLineTotal, priceSource, palletCount, colisCount, costPrice,
          productName || null
        ]);
      }

      // Update order totals after inserting all items
      const updateOrderQuery = `
        UPDATE Orders
        SET 
          SubTotal = (SELECT SUM(LineTotal - TaxAmount) FROM OrderItems WHERE OrderID = $1),
          TaxAmount = (SELECT SUM(TaxAmount) FROM OrderItems WHERE OrderID = $1),
          TotalAmount = (SELECT SUM(LineTotal) FROM OrderItems WHERE OrderID = $1),
          UpdatedAt = CURRENT_TIMESTAMP
        WHERE OrderID = $1
        RETURNING 
          OrderID as orderid, OrderNumber as ordernumber, OrderDate as orderdate, Status as status,
          TotalAmount as totalamount, SubTotal as subtotal, TaxAmount as taxamount, 
          PaymentAmount as paymentamount, PaymentMethod as paymentmethod,
          OrderType as ordertype, Notes as notes, CustomerID as customerid,
          RetailClientName as retailclientname, WarehouseID as warehouseid
      `;
      const finalUpdatedOrder = await client.query(updateOrderQuery, [orderId]);
      orderResult.rows[0] = finalUpdatedOrder.rows[0];
    }
    // ---------------------------------------------

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
    
    if (parseFloat(quantity) <= 0) {
      throw new Error(`La quantité pour "${productName || 'ce produit'}" doit être supérieure à 0.`);
    }

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

    // Get product details for stock check + unit conversion
    const productResult = await client.query(
      'SELECT p.PurchasePrice, p.BasePrice, p.ProductName, p.ProductCode, p.Size, p.PrimaryUnitID, p.QteParColis, u.UnitCode as PrimaryUnitCode FROM Products p LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID WHERE p.ProductID = $1',
      [productId]
    );
    const costPrice = parseFloat(productResult.rows[0]?.purchaseprice) || parseFloat(productResult.rows[0]?.baseprice) || 0;
    const product = productResult.rows[0];

    // ═══════════════════════════════════════════════════════════
    // STOCK CHECK — MUST happen BEFORE insert, inside transaction
    // ═══════════════════════════════════════════════════════════
    if (product && product.productcode !== 'MANUAL' && !isServiceItem(product.productname || productName)) {
      // Fetch Unit Code for the item
      const unitRes = await client.query('SELECT UnitCode FROM Units WHERE UnitID = $1', [unitId]);
      const unitCode = unitRes.rows.length > 0 ? unitRes.rows[0].unitcode : 'PCS';

      let qtyToReserve = parseFloat(quantity) || 0;
      const sqmPerPiece = parseSqmPerPiece(product.size || product.productname);

      // Universal UNIT CONVERSION LOGIC
      qtyToReserve = convertUnitToInventory(qtyToReserve, unitCode, product.primaryunitcode, sqmPerPiece, product.productname, parseFloat(product.qteparcolis) || 0);

      const warehouseId = orderResult.rows[0].warehouseid || 1;

      // Check stock availability BEFORE inserting the order item
      const inventoryCheck = await client.query('SELECT QuantityOnHand, QuantityReserved FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = \'OWNED\'', [productId, warehouseId]);

      let currentOnHand = 0;
      let currentReserved = 0;

      if (inventoryCheck.rows.length > 0) {
        currentOnHand = parseFloat(inventoryCheck.rows[0].quantityonhand);
        currentReserved = parseFloat(inventoryCheck.rows[0].quantityreserved);
      }

      const available = currentOnHand - currentReserved;
      // Stock constraint removed here to allow adding to PENDING orders.
      // The check is instead performed during finalizeOrder.

      // Reserve inventory (still inside transaction — will rollback if anything fails)
      await client.query(`
          UPDATE Inventory 
          SET QuantityReserved = QuantityReserved + $1,
              UpdatedAt = CURRENT_TIMESTAMP
          WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
      `, [qtyToReserve, productId, warehouseId]);
    } else if (product && product.productcode === 'MANUAL') {
      console.log('Skipping inventory reservation for MANUAL product');
    }

    // ═══════════════════════════════════════════════════════════
    // PRICING — Price Waterfall Logic
    // ═══════════════════════════════════════════════════════════
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
    const updatedOrder = await client.query(`
      UPDATE Orders
      SET 
        SubTotal = (SELECT SUM(LineTotal - TaxAmount) FROM OrderItems WHERE OrderID = $1),
        TaxAmount = (SELECT SUM(TaxAmount) FROM OrderItems WHERE OrderID = $1),
        TotalAmount = (SELECT SUM(LineTotal) FROM OrderItems WHERE OrderID = $1),
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE OrderID = $1
      RETURNING 
        OrderID as orderid, OrderNumber as ordernumber, OrderDate as orderdate, Status as status,
        TotalAmount as totalamount, SubTotal as subtotal, TaxAmount as taxamount, 
        PaymentAmount as paymentamount, PaymentMethod as paymentmethod,
        OrderType as ordertype, Notes as notes, CustomerID as customerid,
        RetailClientName as retailclientname, WarehouseID as warehouseid
    `, [orderId]);

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
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateOrderStatus(req, res, next) {
  const client = await pool.connect();
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

    await client.query('BEGIN');

    // Fetch current status and warehouse info to track transition
    const currentOrderResult = await client.query(
      'SELECT OrderNumber, Status, WarehouseID FROM Orders WHERE OrderID = $1',
      [id]
    );

    if (currentOrderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const orderRecord = currentOrderResult.rows[0];
    const oldStatus = orderRecord.status;
    const warehouseId = orderRecord.warehouseid;
    const orderNumber = orderRecord.ordernumber;

    // Enforcement: If moving from PENDING to a validated status (CONFIRMED), check stock availability
    if (status === 'CONFIRMED' && oldStatus === 'PENDING') {
      try {
        const itemsResult = await checkOrderStock(client, id, warehouseId);
        // Deduct inventory as well to avoid stock drift
        // Passes audit info: orderId, orderNumber, userId
        await deductOrderInventory(client, itemsResult.rows, warehouseId, id, orderNumber, req.user?.userId);
      } catch (stockErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: stockErr.message
        });
      }
    }

    const updateQuery = `
      UPDATE Orders
      SET Status = $1, UpdatedAt = CURRENT_TIMESTAMP
      WHERE OrderID = $2
      RETURNING *
    `;

    const result = await client.query(updateQuery, [status, id]);

    await client.query('COMMIT');

    // Refresh materialized view to update stock in catalogue/POS/purchasing
    try {
      await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
    } catch (refreshError) {
      console.log('Note: mv_Catalogue refresh skipped:', refreshError.message);
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
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

    // 1. Check if order is in PENDING status
    if (order.status !== 'PENDING') {
      throw new Error(`Cette commande ne peut pas être validée. Statut actuel: ${order.status}`);
    }

    // 2. PRE-VALIDATION: Get items and check stock BEFORE any accounting entries
    let itemsResult;
    try {
      itemsResult = await checkOrderStock(client, orderId, order.warehouseid || 1);
    } catch (stockErr) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: stockErr.message
      });
    }

    // 3. Validation passed, proceed with accounting
    // Record VENTE transaction (the sale amount)
    await accountingService.recordSaleTransaction({
      amount: totalAmount,
      customerName: order.customername,
      orderNumber: order.ordernumber,
      orderId: order.orderid,
      userId: req.user?.userId
    }, client);

    // If there's a payment, record VERSEMENT transaction
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
    }

    // Calculate unpaidAmount here so it's available for both balance update and response
    const unpaidAmount = totalAmount - payment;

    // Update customer balance
    if (unpaidAmount !== 0 && order.customerid) {
      await client.query(
        'UPDATE Customers SET CurrentBalance = CurrentBalance + $1 WHERE CustomerID = $2',
        [unpaidAmount, order.customerid]
      );
    }

    // Update order status to CONFIRMED
    const result = await pool.query(`
      UPDATE Orders 
      SET Status = $1, UpdatedAt = CURRENT_TIMESTAMP 
      WHERE OrderID = $2 
      RETURNING 
        OrderID as orderid, OrderNumber as ordernumber, OrderDate as orderdate, Status as status,
        TotalAmount as totalamount, SubTotal as subtotal, TaxAmount as taxamount, 
        PaymentAmount as paymentamount, PaymentMethod as paymentmethod,
        OrderType as ordertype, Notes as notes, CustomerID as customerid,
        RetailClientName as retailclientname, WarehouseID as warehouseid
    `, ['CONFIRMED', orderId]);

    // ===== INVENTORY DEDUCTION =====
    await deductOrderInventory(client, itemsResult.rows, order.warehouseid, orderId, order.ordernumber, req.user?.userId);

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

    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED' && order.status !== 'DELIVERED' && order.status !== 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Seules les commandes en attente, confirmées, livrées ou annulées peuvent être modifiées' });
    }

    // 2. REVERT LOGIC (Inventory & Financials)

    // 2a. Revert Inventory
    // Fetch old items with product details for unit conversion
    const oldItemsRes = await client.query(`
        SELECT oi.*, p.ProductName, p.Size, p.PrimaryUnitID, pu_p.UnitCode as PrimaryUnitCode, u.UnitCode 
        FROM OrderItems oi
        JOIN Products p ON oi.ProductID = p.ProductID
        LEFT JOIN Units pu_p ON p.PrimaryUnitID = pu_p.UnitID
        LEFT JOIN Units u ON oi.UnitID = u.UnitID
        WHERE oi.OrderID = $1
    `, [id]);

    for (const item of oldItemsRes.rows) {
      if (isServiceItem(item.productname)) continue;
      const qty = parseFloat(item.quantity);
      const sqmPerPiece = parseSqmPerPiece(item.size || item.productname);
      const convertedQty = convertUnitToInventory(qty, item.unitcode, item.primaryunitcode, sqmPerPiece, item.productname);

      if (order.status === 'PENDING' || order.status === 'CANCELLED') {
        // PENDING/CANCELLED: Simply un-reserve
        await client.query(`
          UPDATE Inventory 
          SET QuantityReserved = GREATEST(0, QuantityReserved - $1)
          WHERE ProductID = $2 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
        `, [convertedQty, item.productid]);
      } else if (order.status === 'CONFIRMED' || order.status === 'DELIVERED') {
        // CONFIRMED/DELIVERED: Item was SOLD (Deducted from OnHand). Add it back to OnHand.
        await client.query(`
          UPDATE Inventory 
          SET QuantityOnHand = QuantityOnHand + $1
          WHERE ProductID = $2 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
        `, [convertedQty, item.productid]);
      }
    }

    // 2b. Revert Financials (CONFIRMED Only)
    if (order.status === 'CONFIRMED' || order.status === 'DELIVERED') {
      // Reverse Customer Balance Update (Wholesale only)
      const isRetailOrder = order.ordertype === 'RETAIL';
      // Reverse Customer Balance Update
      // Must match what finalizeOrder added, which is now unpaidAmount (total - payment) for all orders.
      if (order.customerid) {
        const oldTotal = parseFloat(order.totalamount) || 0;
        const oldPayment = parseFloat(order.paymentamount) || 0;
        const oldUnpaid = oldTotal - oldPayment;

        if (oldUnpaid !== 0) {
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

      // 5. Insert NEW items and Reserve Inventory (SKIPPING MANUAL PRODUCTS)
      // Note: We always Reserve (Status is PENDING now). 
      // User must click Confirm again to finalize/deduct stock.
      for (const item of items) {
        const lineTotal = Number(item.quantity) * Number(item.unitPrice);

        // Get product details for cost, code check, and UNIT CONVERSION
        const productRes = await client.query(
          `SELECT p.PurchasePrice, p.BasePrice, p.ProductCode, p.ProductName, p.Size, p.PrimaryUnitID, p.QteParColis, 
                  u.UnitCode as PrimaryUnitCode 
           FROM Products p 
           LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID 
           WHERE p.ProductID = $1`,
          [item.productId]
        );
        const p = productRes.rows[0];
        const costPrice = parseFloat(p?.purchaseprice) || parseFloat(p?.baseprice) || 0;
        const pCode = p?.productcode || '';

        // Insert Item with CostPrice and LinkProductName
        // Use palletCount/palettes and colisCount/cartons with fallbacks
        const palletCount = parseFloat(item.palletCount || item.palettes) || 0;
        const colisCount = parseFloat(item.colisCount || item.cartons) || 0;

        await client.query(`
                INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice, LineTotal, UnitID, PalletCount, ColisCount, CostPrice, LinkProductName)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                id, 
                item.productId, 
                item.quantity, 
                item.unitPrice, 
                lineTotal, 
                item.unitId, 
                palletCount, 
                colisCount, 
                costPrice, 
                item.productName || null
            ]);

        // Reserve Inventory ONLY if NOT MANUAL and NOT a Service Item
        if (pCode !== 'MANUAL' && p && !isServiceItem(p.productname || item.productName)) {
          // Fetch Unit Code for the current item unit
          const unitRes = await client.query('SELECT UnitCode FROM Units WHERE UnitID = $1', [item.unitId]);
          const unitCode = unitRes.rows.length > 0 ? unitRes.rows[0].unitcode : 'PCS';

          const sqmPerPiece = parseSqmPerPiece(p.size || p.productname);
          let qtyToReserve = parseFloat(item.quantity) || 0;

          // Universal UNIT CONVERSION LOGIC
          qtyToReserve = convertUnitToInventory(
            qtyToReserve, 
            unitCode, 
            p.primaryunitcode, 
            sqmPerPiece, 
            p.productname, 
            parseFloat(p.qteparcolis) || 0
          );

          // Assuming Warehouse 1 (standard for POS)
          const invCheck = await client.query('SELECT InventoryID FROM Inventory WHERE ProductID = $1 AND WarehouseID = 1 AND OwnershipType = \'OWNED\'', [item.productId]);

          if (invCheck.rows.length > 0) {
            await client.query(`
                UPDATE Inventory 
                SET QuantityReserved = QuantityReserved + $1,
                    UpdatedAt = CURRENT_TIMESTAMP
                WHERE ProductID = $2 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
              `, [qtyToReserve, item.productId]);
          } else {
            // Create inventory record if missing (safety check)
            await client.query(`
                INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityReserved, QuantityOnHand)
                VALUES ($1, 1, 'OWNED', $2, 0)
              `, [item.productId, qtyToReserve]);
          }
        }
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
      if (isServiceItem(item.productname)) continue;
      const qty = parseFloat(item.quantity) || 0;
      const sqmPerPiece = parseSqmPerPiece(item.size || item.productname);
      const qtyToRelease = convertUnitToInventory(qty, item.unitcode, item.primaryunitcode, sqmPerPiece, item.productname);

      await client.query(`
            UPDATE Inventory SET QuantityReserved = GREATEST(0, QuantityReserved - $1)
            WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = 'OWNED'
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


const pool = require('../../../config/database');

/**
 * Accounting Service - Handles automatic cash transaction creation
 */

/**
 * Get default cash account ID
 */
async function getDefaultAccountId(client = null) {
    const db = client || pool;
    const result = await db.query(
        'SELECT AccountID FROM CashAccounts WHERE IsDefault = TRUE AND IsActive = TRUE LIMIT 1'
    );
    if (result.rows.length === 0) {
        // Fallback: get any active account
        const fallback = await db.query(
            'SELECT AccountID FROM CashAccounts WHERE IsActive = TRUE ORDER BY AccountID LIMIT 1'
        );
        return fallback.rows[0]?.accountid || null;
    }
    return result.rows[0].accountid;
}

/**
 * Record a sale transaction (VENTE)
 * Called when an order is created/confirmed
 */
async function recordSaleTransaction(params, client = null) {
    const {
        amount,
        customerName,
        orderNumber,
        orderId,
        userId,
        accountId
    } = params;

    const db = client || pool;
    const actualAccountId = accountId || await getDefaultAccountId(db);

    if (!actualAccountId) {
        console.warn('No cash account found, skipping sale transaction recording');
        return null;
    }

    try {
        // Insert VENTE transaction
        const result = await db.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, ReferenceType, ReferenceID, CreatedBy)
      VALUES ($1, 'VENTE', $2, $3, $4, 'ORDER', $5, $6)
      RETURNING TransactionID
    `, [actualAccountId, amount, customerName, `Vente ${orderNumber}`, orderId, userId]);

        // Update account balance
        await db.query(
            'UPDATE CashAccounts SET Balance = Balance + $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [amount, actualAccountId]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error recording sale transaction:', error);
        throw error;
    }
}

/**
 * Record a payment/versement transaction
 * Called when a customer makes a payment
 */
async function recordPaymentTransaction(params, client = null) {
    const {
        amount,
        customerName,
        orderNumber,
        orderId,
        userId,
        accountId,
        type = 'VERSEMENT', // VERSEMENT or ENCAISSEMENT
        paymentMethod = 'ESPECE' // ESPECE, VIREMENT, CHEQUE
    } = params;

    if (!amount || amount <= 0) return null;

    const db = client || pool;
    const actualAccountId = accountId || await getDefaultAccountId(db);

    if (!actualAccountId) {
        console.warn('No cash account found, skipping payment transaction recording');
        return null;
    }

    // Build motif with payment method
    const paymentMethodLabel = paymentMethod === 'VIREMENT' ? 'Virement' : (paymentMethod === 'CHEQUE' ? 'Chèque' : 'Espèce');
    const motif = `Versement ${orderNumber} (${paymentMethodLabel})`;

    try {
        // Insert payment transaction
        const result = await db.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, ReferenceType, ReferenceID, CreatedBy)
      VALUES ($1, $2, $3, $4, $5, 'ORDER', $6, $7)
      RETURNING TransactionID
    `, [actualAccountId, type, amount, customerName, motif, orderId, userId]);

        // Update account balance
        await db.query(
            'UPDATE CashAccounts SET Balance = Balance + $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [amount, actualAccountId]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error recording payment transaction:', error);
        throw error;
    }
}

/**
 * Record a purchase transaction (ACHAT)
 * Called when a purchase order is received
 */
async function recordPurchaseTransaction(params, client = null) {
    const {
        amount,
        supplierName,
        purchaseOrderNumber,
        purchaseOrderId,
        userId,
        accountId
    } = params;

    const db = client || pool;
    const actualAccountId = accountId || await getDefaultAccountId(db);

    if (!actualAccountId) {
        console.warn('No cash account found, skipping purchase transaction recording');
        return null;
    }

    try {
        // Insert ACHAT transaction
        const result = await db.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, ReferenceType, ReferenceID, CreatedBy)
      VALUES ($1, 'ACHAT', $2, $3, $4, 'PURCHASE', $5, $6)
      RETURNING TransactionID
    `, [actualAccountId, amount, supplierName, `Achat ${purchaseOrderNumber}`, purchaseOrderId, userId]);

        // Update account balance (decrease)
        await db.query(
            'UPDATE CashAccounts SET Balance = Balance - $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [amount, actualAccountId]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error recording purchase transaction:', error);
        throw error;
    }
}

/**
 * Record sale return (RETOUR_VENTE)
 */
async function recordSaleReturnTransaction(params, client = null) {
    const {
        amount,
        customerName,
        orderNumber,
        orderId,
        userId,
        accountId
    } = params;

    const db = client || pool;
    const actualAccountId = accountId || await getDefaultAccountId(db);

    if (!actualAccountId) return null;

    try {
        const result = await db.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, ReferenceType, ReferenceID, CreatedBy)
      VALUES ($1, 'RETOUR_VENTE', $2, $3, $4, 'ORDER', $5, $6)
      RETURNING TransactionID
    `, [actualAccountId, amount, customerName, `Retour ${orderNumber}`, orderId, userId]);

        // Update account balance (decrease)
        await db.query(
            'UPDATE CashAccounts SET Balance = Balance - $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [amount, actualAccountId]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error recording sale return transaction:', error);
        throw error;
    }
}

/**
 * Record purchase return (RETOUR_ACHAT)
 * Called when a purchase return is approved (returning goods to supplier)
 */
async function recordPurchaseReturnTransaction(params, client = null) {
    const {
        amount,
        supplierName,
        purchaseOrderNumber,
        purchaseOrderId,
        returnId,
        userId,
        accountId
    } = params;

    const db = client || pool;
    const actualAccountId = accountId || await getDefaultAccountId(db);

    if (!actualAccountId) return null;

    try {
        const result = await db.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, ReferenceType, ReferenceID, CreatedBy)
      VALUES ($1, 'RETOUR_ACHAT', $2, $3, $4, 'PURCHASE', $5, $6)
      RETURNING TransactionID
    `, [actualAccountId, amount, supplierName, `Retour Achat ${purchaseOrderNumber || ''}`.trim(), returnId || purchaseOrderId, userId]);

        // Update account balance (increase - we get value back)
        await db.query(
            'UPDATE CashAccounts SET Balance = Balance + $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [amount, actualAccountId]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error recording purchase return transaction:', error);
        throw error;
    }
}

module.exports = {
    getDefaultAccountId,
    recordSaleTransaction,
    recordPaymentTransaction,
    recordPurchaseTransaction,
    recordSaleReturnTransaction,
    recordPurchaseReturnTransaction
};

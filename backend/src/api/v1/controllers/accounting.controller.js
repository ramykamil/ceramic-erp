const pool = require('../../../config/database');

// ========================================
// CASH ACCOUNTS
// ========================================

/**
 * Get all cash accounts
 */
const getCashAccounts = async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT 
        AccountID as accountid,
        AccountName as accountname,
        Description as description,
        Balance as balance,
        IsDefault as isdefault,
        IsActive as isactive,
        CreatedAt as createdat,
        UpdatedAt as updatedat
      FROM CashAccounts 
      WHERE IsActive = TRUE
      ORDER BY IsDefault DESC, AccountName ASC
    `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching cash accounts:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des comptes', error: error.message });
    }
};

/**
 * Create a new cash account
 */
const createCashAccount = async (req, res) => {
    const { accountName, description, initialBalance = 0 } = req.body;

    if (!accountName) {
        return res.status(400).json({ success: false, message: 'Le nom du compte est requis' });
    }

    try {
        const result = await pool.query(`
      INSERT INTO CashAccounts (AccountName, Description, Balance) 
      VALUES ($1, $2, $3)
      RETURNING AccountID as accountid, AccountName as accountname, Description as description, 
                Balance as balance, IsDefault as isdefault, IsActive as isactive
    `, [accountName, description || null, initialBalance]);

        res.status(201).json({ success: true, data: result.rows[0], message: 'Compte créé avec succès' });
    } catch (error) {
        console.error('Error creating cash account:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la création du compte', error: error.message });
    }
};

/**
 * Delete a cash account (only if balance is 0)
 */
const deleteCashAccount = async (req, res) => {
    const { id } = req.params;

    try {
        // Check if account exists and has 0 balance
        const checkResult = await pool.query(
            'SELECT Balance, IsDefault FROM CashAccounts WHERE AccountID = $1',
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Compte non trouvé' });
        }

        if (checkResult.rows[0].isdefault) {
            return res.status(400).json({ success: false, message: 'Impossible de supprimer le compte par défaut' });
        }

        if (parseFloat(checkResult.rows[0].balance) !== 0) {
            return res.status(400).json({ success: false, message: 'Impossible de supprimer un compte avec un solde non nul' });
        }

        // Soft delete
        await pool.query('UPDATE CashAccounts SET IsActive = FALSE WHERE AccountID = $1', [id]);

        res.json({ success: true, message: 'Compte supprimé avec succès' });
    } catch (error) {
        console.error('Error deleting cash account:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la suppression du compte', error: error.message });
    }
};

/**
 * Set account as default
 */
const setDefaultCashAccount = async (req, res) => {
    const { id } = req.params;

    try {
        // Start transaction
        await pool.query('BEGIN');

        // Remove default from all accounts
        await pool.query('UPDATE CashAccounts SET IsDefault = FALSE WHERE IsDefault = TRUE');

        // Set new default
        const result = await pool.query(
            'UPDATE CashAccounts SET IsDefault = TRUE WHERE AccountID = $1 RETURNING AccountID',
            [id]
        );

        if (result.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Compte non trouvé' });
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: 'Compte défini comme compte par défaut' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error setting default account:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la modification du compte par défaut', error: error.message });
    }
};

// ========================================
// CASH TRANSACTIONS
// ========================================

/**
 * Get transactions with filters
 */
const getCashTransactions = async (req, res) => {
    const {
        accountId,
        transactionType,
        startDate,
        endDate,
        search,
        chargeType,
        createdBy,
        limit = 100,
        offset = 0
    } = req.query;

    try {
        let whereConditions = ['1=1'];
        let params = [];
        let paramIndex = 1;

        if (accountId) {
            whereConditions.push(`ct.AccountID = $${paramIndex++}`);
            params.push(accountId);
        }

        if (transactionType && transactionType !== 'TOUS') {
            whereConditions.push(`ct.TransactionType = $${paramIndex++}`);
            params.push(transactionType);
        }

        if (startDate) {
            whereConditions.push(`ct.CreatedAt >= $${paramIndex++}`);
            params.push(startDate);
        }

        if (endDate) {
            whereConditions.push(`ct.CreatedAt <= $${paramIndex++}::date + INTERVAL '1 day'`);
            params.push(endDate);
        }

        if (search) {
            whereConditions.push(`(ct.Tiers ILIKE $${paramIndex} OR ct.Motif ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (chargeType) {
            whereConditions.push(`ct.ChargeType = $${paramIndex++}`);
            params.push(chargeType);
        }

        if (createdBy) {
            whereConditions.push(`ct.CreatedBy = $${paramIndex++}`);
            params.push(createdBy);
        }

        const query = `
      SELECT 
        ct.TransactionID as transactionid,
        ct.AccountID as accountid,
        ca.AccountName as accountname,
        ct.TransactionType as transactiontype,
        ct.Amount as amount,
        ct.Tiers as tiers,
        ct.Motif as motif,
        ct.ReferenceType as referencetype,
        ct.ReferenceID as referenceid,
        ct.ChargeType as chargetype,
        ct.Notes as notes,
        ct.CreatedBy as createdby,
        u.Username as createdbyname,
        ct.CreatedAt as createdat
      FROM CashTransactions ct
      JOIN CashAccounts ca ON ct.AccountID = ca.AccountID
      LEFT JOIN Users u ON ct.CreatedBy = u.UserID
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ct.CreatedAt DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching cash transactions:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des transactions', error: error.message });
    }
};

/**
 * Create a new cash transaction
 */
const createCashTransaction = async (req, res) => {
    const {
        accountId,
        transactionType,
        amount,
        tiers,
        motif,
        referenceType,
        referenceId,
        chargeType,
        notes
    } = req.body;
    const createdBy = req.user?.userId || null;

    if (!accountId || !transactionType || !amount) {
        return res.status(400).json({
            success: false,
            message: 'AccountID, TransactionType et Amount sont requis'
        });
    }

    // Validate transaction type
    const validTypes = ['VENTE', 'ACHAT', 'RETOUR_VENTE', 'RETOUR_ACHAT', 'ENCAISSEMENT', 'DECAISSEMENT', 'VERSEMENT', 'PAIEMENT', 'CHARGE', 'TRANSFERT'];
    if (!validTypes.includes(transactionType)) {
        return res.status(400).json({ success: false, message: 'Type de transaction invalide' });
    }

    try {
        await pool.query('BEGIN');

        // Determine if this is income or expense
        const incomeTypes = ['VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT'];
        const isIncome = incomeTypes.includes(transactionType);
        const balanceChange = isIncome ? Math.abs(amount) : -Math.abs(amount);

        // Insert transaction
        const insertResult = await pool.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, ReferenceType, ReferenceID, ChargeType, Notes, CreatedBy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING TransactionID as transactionid, TransactionType as transactiontype, Amount as amount
    `, [accountId, transactionType, Math.abs(amount), tiers, motif, referenceType, referenceId, chargeType, notes, createdBy]);

        // Update Customer Balance if linked
        if ((referenceType === 'CLIENT' || referenceType === 'CUSTOMER') && referenceId) {
            // Logic: 
            // - Income (VERSEMENT, ENCAISSEMENT, VENTE): Client gives money -> Debt Decreases (-Amount)
            // - Expense (DECAISSEMENT): We give money -> Debt Increases or Credit Decreases (+Amount)
            const customerBalanceChange = isIncome ? -Math.abs(amount) : Math.abs(amount);

            await pool.query(
                'UPDATE Customers SET CurrentBalance = CurrentBalance + $1, UpdatedAt = NOW() WHERE CustomerID = $2',
                [customerBalanceChange, referenceId]
            );
        }

        // Update Supplier Balance if linked
        if ((referenceType === 'BRAND' || referenceType === 'FACTORY') && referenceId) {
            // Logic for Suppliers (Opposite of Clients usually, assuming Balance = We Owe Them):
            // - Expense (PAIEMENT, ACHAT): We pay/buy cash -> Debt Decreases or Stays same?
            //   If PAIEMENT meant "Payment of Debt", then Debt Decreases (-).
            // - Income (RETOUR_ACHAT): We get money back -> Debt Increases (or "Credit" we obtained is used up? No.)
            //   If we return goods, we get Credit (Debt decr). If they Refund us Cash, that Credit is used (Debt Incr).
            //   So Income = Debt Increases.
            // Result: isIncome ? + : -
            const supplierChange = isIncome ? Math.abs(amount) : -Math.abs(amount);
            const table = referenceType === 'BRAND' ? 'Brands' : 'Factories';
            const idCol = referenceType === 'BRAND' ? 'BrandID' : 'FactoryID';

            // Use safe interpolation for table name since it comes from controlled string
            const query = `UPDATE ${table} SET CurrentBalance = CurrentBalance + $1, UpdatedAt = NOW() WHERE ${idCol} = $2`;
            await pool.query(query, [supplierChange, referenceId]);
        }

        // Update account balance
        await pool.query(
            'UPDATE CashAccounts SET Balance = Balance + $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [balanceChange, accountId]
        );

        await pool.query('COMMIT');

        res.status(201).json({
            success: true,
            data: insertResult.rows[0],
            message: 'Transaction enregistrée avec succès'
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error creating cash transaction:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la création de la transaction', error: error.message });
    }
};

/**
 * Get summary for period
 */
const getCashSummary = async (req, res) => {
    const { startDate, endDate, accountId } = req.query;

    try {
        let dateFilter = '';
        let params = [];
        let paramIndex = 1;

        if (startDate) {
            dateFilter += ` AND ct.CreatedAt >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            dateFilter += ` AND ct.CreatedAt <= $${paramIndex++}::date + INTERVAL '1 day'`;
            params.push(endDate);
        }
        if (accountId) {
            dateFilter += ` AND ct.AccountID = $${paramIndex++}`;
            params.push(accountId);
        }

        // Get totals by type
        const summaryResult = await pool.query(`
      SELECT 
        TransactionType as type,
        SUM(Amount) as total,
        COUNT(*) as count
      FROM CashTransactions ct
      WHERE 1=1 ${dateFilter}
      GROUP BY TransactionType
    `, params);

        // Calculate totals
        const summary = {
            totalVente: 0,
            totalAchat: 0,
            retourVente: 0,
            retourAchat: 0,
            encaissement: 0,
            decaissement: 0,
            versements: 0,
            paiement: 0,
            charges: 0,
            transfert: 0
        };

        summaryResult.rows.forEach(row => {
            const total = parseFloat(row.total) || 0;
            switch (row.type) {
                case 'VENTE': summary.totalVente = total; break;
                case 'ACHAT': summary.totalAchat = total; break;
                case 'RETOUR_VENTE': summary.retourVente = total; break;
                case 'RETOUR_ACHAT': summary.retourAchat = total; break;
                case 'ENCAISSEMENT': summary.encaissement = total; break;
                case 'DECAISSEMENT': summary.decaissement = total; break;
                case 'VERSEMENT': summary.versements = total; break;
                case 'PAIEMENT': summary.paiement = total; break;
                case 'CHARGE': summary.charges = total; break;
                case 'TRANSFERT': summary.transfert = total; break;
            }
        });

        // Get current total balance
        let balanceQuery = 'SELECT SUM(Balance) as total FROM CashAccounts WHERE IsActive = TRUE';
        if (accountId) {
            balanceQuery = `SELECT Balance as total FROM CashAccounts WHERE AccountID = $1`;
        }
        const balanceResult = await pool.query(balanceQuery, accountId ? [accountId] : []);
        const currentBalance = parseFloat(balanceResult.rows[0]?.total) || 0;

        // Get previous balance (balance before start date)
        let previousBalance = 0;
        if (startDate) {
            let prevParams = [startDate];
            let prevFilter = '';
            if (accountId) {
                prevFilter = ` AND AccountID = $2`;
                prevParams.push(accountId);
            }

            // Calculate what the balance was before the period
            const prevResult = await pool.query(`
        SELECT 
          COALESCE(SUM(
            CASE WHEN TransactionType IN ('VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT') 
              THEN Amount 
              ELSE -Amount 
            END
          ), 0) as periodchange
        FROM CashTransactions ct
        WHERE ct.CreatedAt >= $1 ${prevFilter}
      `, prevParams);

            previousBalance = currentBalance - (parseFloat(prevResult.rows[0]?.periodchange) || 0);
        }

        res.json({
            success: true,
            data: {
                ...summary,
                currentBalance,
                previousBalance,
                totalVenteNet: summary.totalVente - summary.retourVente + summary.versements,
                totalAchatNet: summary.totalAchat - summary.retourAchat + summary.paiement,
                totalCharges: summary.charges + summary.decaissement
            }
        });
    } catch (error) {
        console.error('Error fetching cash summary:', error);
        res.status(500).json({ success: false, message: 'Erreur lors du calcul du résumé', error: error.message });
    }
};

/**
 * Transfer between accounts
 */
const createCashTransfer = async (req, res) => {
    const { fromAccountId, toAccountId, amount, motif, notes } = req.body;
    const createdBy = req.user?.userId || null;

    if (!fromAccountId || !toAccountId || !amount) {
        return res.status(400).json({
            success: false,
            message: 'Comptes source et destination et montant sont requis'
        });
    }

    if (fromAccountId === toAccountId) {
        return res.status(400).json({
            success: false,
            message: 'Les comptes source et destination doivent être différents'
        });
    }

    const transferAmount = Math.abs(parseFloat(amount));
    if (transferAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Le montant doit être supérieur à 0' });
    }

    try {
        await pool.query('BEGIN');

        // Check source account balance
        const sourceResult = await pool.query(
            'SELECT Balance, AccountName FROM CashAccounts WHERE AccountID = $1',
            [fromAccountId]
        );

        if (sourceResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Compte source non trouvé' });
        }

        if (parseFloat(sourceResult.rows[0].balance) < transferAmount) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Solde insuffisant dans le compte source' });
        }

        // Get destination account name
        const destResult = await pool.query(
            'SELECT AccountName FROM CashAccounts WHERE AccountID = $1',
            [toAccountId]
        );

        if (destResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Compte destination non trouvé' });
        }

        const transferMotif = motif || `Transfert vers ${destResult.rows[0].accountname}`;

        // Create outgoing transaction (from source)
        await pool.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, Notes, CreatedBy)
      VALUES ($1, 'TRANSFERT', $2, $3, $4, $5, $6)
    `, [fromAccountId, transferAmount, destResult.rows[0].accountname, `Transfert sortant: ${transferMotif}`, notes, createdBy]);

        // Create incoming transaction (to destination)
        await pool.query(`
      INSERT INTO CashTransactions 
        (AccountID, TransactionType, Amount, Tiers, Motif, Notes, CreatedBy)
      VALUES ($1, 'TRANSFERT', $2, $3, $4, $5, $6)
    `, [toAccountId, transferAmount, sourceResult.rows[0].accountname, `Transfert entrant: ${transferMotif}`, notes, createdBy]);

        // Update balances
        await pool.query(
            'UPDATE CashAccounts SET Balance = Balance - $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [transferAmount, fromAccountId]
        );
        await pool.query(
            'UPDATE CashAccounts SET Balance = Balance + $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [transferAmount, toAccountId]
        );

        await pool.query('COMMIT');

        res.status(201).json({
            success: true,
            message: `Transfert de ${transferAmount.toLocaleString('fr-DZ')} DA effectué avec succès`
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error creating transfer:', error);
        res.status(500).json({ success: false, message: 'Erreur lors du transfert', error: error.message });
    }
};

/**
 * Get account journal (transaction history for specific account)
 */
const getAccountJournal = async (req, res) => {
    const { id } = req.params;
    const { startDate, endDate, limit = 500 } = req.query;

    try {
        let params = [id, limit];
        let dateFilter = '';
        let paramIndex = 3;

        if (startDate) {
            dateFilter += ` AND ct.CreatedAt >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            dateFilter += ` AND ct.CreatedAt <= $${paramIndex++}::date + INTERVAL '1 day'`;
            params.push(endDate);
        }

        const result = await pool.query(`
      SELECT 
        ct.TransactionID as transactionid,
        ct.TransactionType as transactiontype,
        ct.Amount as amount,
        ct.Tiers as tiers,
        ct.Motif as motif,
        ct.ChargeType as chargetype,
        ct.Notes as notes,
        u.Username as createdbyname,
        ct.CreatedAt as createdat,
        CASE WHEN ct.TransactionType IN ('VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT') 
          THEN ct.Amount ELSE 0 END as recette,
        CASE WHEN ct.TransactionType IN ('ACHAT', 'DECAISSEMENT', 'PAIEMENT', 'RETOUR_VENTE', 'CHARGE') 
          THEN ct.Amount ELSE 0 END as depense
      FROM CashTransactions ct
      LEFT JOIN Users u ON ct.CreatedBy = u.UserID
      WHERE ct.AccountID = $1 ${dateFilter}
      ORDER BY ct.CreatedAt DESC
      LIMIT $2
    `, params);

        // Get account info
        const accountResult = await pool.query(
            'SELECT AccountName as accountname, Balance as balance FROM CashAccounts WHERE AccountID = $1',
            [id]
        );

        res.json({
            success: true,
            data: {
                account: accountResult.rows[0],
                transactions: result.rows
            }
        });
    } catch (error) {
        console.error('Error fetching account journal:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération du journal', error: error.message });
    }
};

/**
 * Get client versements (payments) with client info
 * Filters to VERSEMENT type only and enriches with client data
 */
const getClientVersements = async (req, res) => {
    const {
        accountId,
        startDate,
        endDate,
        search,
        customerId,
        paymentMode,
        limit = 500,
        offset = 0
    } = req.query;

    try {
        let whereConditions = ["ct.TransactionType = 'VERSEMENT'"];
        let params = [];
        let paramIndex = 1;

        if (accountId) {
            whereConditions.push(`ct.AccountID = $${paramIndex++}`);
            params.push(accountId);
        }

        if (startDate) {
            whereConditions.push(`ct.CreatedAt >= $${paramIndex++}`);
            params.push(startDate);
        }

        if (endDate) {
            whereConditions.push(`ct.CreatedAt <= $${paramIndex++}::date + INTERVAL '1 day'`);
            params.push(endDate);
        }

        if (search) {
            whereConditions.push(`(ct.Tiers ILIKE $${paramIndex} OR ct.Motif ILIKE $${paramIndex} OR ct.Notes ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (customerId) {
            whereConditions.push(`ct.ReferenceID = $${paramIndex++}`);
            params.push(customerId);
        }

        if (paymentMode) {
            whereConditions.push(`ct.ChargeType = $${paramIndex++}`);
            params.push(paymentMode);
        }

        const query = `
            SELECT 
                ct.TransactionID as transactionid,
                ct.AccountID as accountid,
                ca.AccountName as accountname,
                ct.TransactionType as transactiontype,
                ct.Amount as amount,
                ct.Tiers as tiers,
                ct.Motif as motif,
                ct.ReferenceType as referencetype,
                ct.ReferenceID as referenceid,
                ct.ChargeType as paymentmode,
                ct.Notes as observation,
                ct.CreatedBy as createdby,
                u.Username as createdbyname,
                ct.CreatedAt as createdat,
                c.CustomerName as customername,
                c.Phone as customerphone,
                c.CurrentBalance as customerbalance
            FROM CashTransactions ct
            JOIN CashAccounts ca ON ct.AccountID = ca.AccountID
            LEFT JOIN Users u ON ct.CreatedBy = u.UserID
            LEFT JOIN Customers c ON (ct.ReferenceType = 'CLIENT' OR ct.ReferenceType = 'CUSTOMER') AND ct.ReferenceID = c.CustomerID
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY ct.CreatedAt DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;

        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total for the filtered versements
        const totalQuery = `
            SELECT COALESCE(SUM(ct.Amount), 0) as total
            FROM CashTransactions ct
            WHERE ${whereConditions.slice(0, -2).join(' AND ') || "ct.TransactionType = 'VERSEMENT'"}
        `;
        const totalResult = await pool.query(totalQuery, params.slice(0, -2));

        res.json({
            success: true,
            data: result.rows,
            total: parseFloat(totalResult.rows[0]?.total) || 0
        });
    } catch (error) {
        console.error('Error fetching client versements:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des versements', error: error.message });
    }
};

/**
 * Update an existing cash transaction
 */
const updateCashTransaction = async (req, res) => {
    const { id } = req.params;
    const {
        accountId,
        amount,
        tiers,
        motif,
        paymentMode,
        notes
    } = req.body;

    try {
        await pool.query('BEGIN');

        // Get original transaction
        const originalResult = await pool.query(
            'SELECT * FROM CashTransactions WHERE TransactionID = $1',
            [id]
        );

        if (originalResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Transaction non trouvée' });
        }

        const original = originalResult.rows[0];
        const originalAmount = parseFloat(original.amount);
        const newAmount = amount !== undefined ? Math.abs(parseFloat(amount)) : originalAmount;
        const amountDifference = newAmount - originalAmount;

        // Update the transaction
        const updateResult = await pool.query(`
            UPDATE CashTransactions 
            SET 
                AccountID = COALESCE($1, AccountID),
                Amount = $2,
                Tiers = COALESCE($3, Tiers),
                Motif = COALESCE($4, Motif),
                ChargeType = COALESCE($5, ChargeType),
                Notes = COALESCE($6, Notes)
            WHERE TransactionID = $7
            RETURNING *
        `, [accountId || original.accountid, newAmount, tiers, motif, paymentMode, notes, id]);

        // If amount changed and linked to a client, update customer balance
        if (amountDifference !== 0 && original.referencetype === 'CLIENT' && original.referenceid) {
            // VERSEMENT reduces debt, so if amount increased, more debt reduced
            const balanceChange = -amountDifference;
            await pool.query(
                'UPDATE Customers SET CurrentBalance = CurrentBalance + $1, UpdatedAt = NOW() WHERE CustomerID = $2',
                [balanceChange, original.referenceid]
            );
        }

        // If account changed or amount changed, update account balances
        const incomeTypes = ['VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT'];
        const isIncome = incomeTypes.includes(original.transactiontype);

        if (amountDifference !== 0) {
            const balanceChange = isIncome ? amountDifference : -amountDifference;
            await pool.query(
                'UPDATE CashAccounts SET Balance = Balance + $1, UpdatedAt = NOW() WHERE AccountID = $2',
                [balanceChange, accountId || original.accountid]
            );
        }

        await pool.query('COMMIT');

        res.json({
            success: true,
            data: updateResult.rows[0],
            message: 'Transaction mise à jour avec succès'
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error updating cash transaction:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour de la transaction', error: error.message });
    }
};

/**
 * Delete a cash transaction and reverse balance changes
 */
const deleteCashTransaction = async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('BEGIN');

        // Get the transaction to be deleted
        const transResult = await pool.query(
            'SELECT * FROM CashTransactions WHERE TransactionID = $1',
            [id]
        );

        if (transResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Transaction non trouvée' });
        }

        const trans = transResult.rows[0];
        const amount = parseFloat(trans.amount);

        // Reverse customer balance if linked to a client
        if (trans.referencetype === 'CLIENT' && trans.referenceid) {
            const incomeTypes = ['VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT'];
            const isIncome = incomeTypes.includes(trans.transactiontype);
            // Reverse: if was income (reduced debt), add back to debt
            const balanceChange = isIncome ? amount : -amount;
            await pool.query(
                'UPDATE Customers SET CurrentBalance = CurrentBalance + $1, UpdatedAt = NOW() WHERE CustomerID = $2',
                [balanceChange, trans.referenceid]
            );
        }

        // Reverse supplier balance if linked
        if ((trans.referencetype === 'BRAND' || trans.referencetype === 'FACTORY') && trans.referenceid) {
            const incomeTypes = ['VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT'];
            const isIncome = incomeTypes.includes(trans.transactiontype);
            const supplierChange = isIncome ? -amount : amount;
            const table = trans.referencetype === 'BRAND' ? 'Brands' : 'Factories';
            const idCol = trans.referencetype === 'BRAND' ? 'BrandID' : 'FactoryID';
            await pool.query(
                `UPDATE ${table} SET CurrentBalance = CurrentBalance + $1, UpdatedAt = NOW() WHERE ${idCol} = $2`,
                [supplierChange, trans.referenceid]
            );
        }

        // Reverse account balance
        const incomeTypes = ['VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT'];
        const isIncome = incomeTypes.includes(trans.transactiontype);
        const accountBalanceChange = isIncome ? -amount : amount;
        await pool.query(
            'UPDATE CashAccounts SET Balance = Balance + $1, UpdatedAt = NOW() WHERE AccountID = $2',
            [accountBalanceChange, trans.accountid]
        );

        // Delete the transaction
        await pool.query('DELETE FROM CashTransactions WHERE TransactionID = $1', [id]);

        await pool.query('COMMIT');

        res.json({ success: true, message: 'Transaction supprimée avec succès' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error deleting cash transaction:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la suppression de la transaction', error: error.message });
    }
};

/**
 * Get supplier (brand/factory) payments with supplier info
 * Filters to PAIEMENT and ACHAT types linked to BRAND or FACTORY
 */
const getSupplierVersements = async (req, res) => {
    const {
        accountId,
        startDate,
        endDate,
        search,
        supplierId,
        supplierType, // 'BRAND' or 'FACTORY'
        limit = 500,
        offset = 0
    } = req.query;

    try {
        let whereConditions = [
            "(ct.ReferenceType = 'BRAND' OR ct.ReferenceType = 'FACTORY')",
            "ct.TransactionType IN ('PAIEMENT', 'ACHAT')"
        ];
        let params = [];
        let paramIndex = 1;

        if (accountId) {
            whereConditions.push(`ct.AccountID = $${paramIndex++}`);
            params.push(accountId);
        }

        if (startDate) {
            whereConditions.push(`ct.CreatedAt >= $${paramIndex++}`);
            params.push(startDate);
        }

        if (endDate) {
            whereConditions.push(`ct.CreatedAt <= $${paramIndex++}::date + INTERVAL '1 day'`);
            params.push(endDate);
        }

        if (search) {
            whereConditions.push(`(ct.Tiers ILIKE $${paramIndex} OR ct.Motif ILIKE $${paramIndex} OR ct.Notes ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (supplierId && supplierType) {
            whereConditions.push(`ct.ReferenceType = $${paramIndex++} AND ct.ReferenceID = $${paramIndex++}`);
            params.push(supplierType, supplierId);
        }

        const query = `
            SELECT 
                ct.TransactionID as transactionid,
                ct.AccountID as accountid,
                ca.AccountName as accountname,
                ct.TransactionType as transactiontype,
                ct.Amount as amount,
                ct.Tiers as tiers,
                ct.Motif as motif,
                ct.ReferenceType as referencetype,
                ct.ReferenceID as referenceid,
                ct.ChargeType as paymentmode,
                ct.Notes as observation,
                ct.CreatedBy as createdby,
                u.Username as createdbyname,
                ct.CreatedAt as createdat,
                COALESCE(b.BrandName, f.FactoryName) as suppliername,
                COALESCE(b.CurrentBalance, f.CurrentBalance) as supplierbalance
            FROM CashTransactions ct
            JOIN CashAccounts ca ON ct.AccountID = ca.AccountID
            LEFT JOIN Users u ON ct.CreatedBy = u.UserID
            LEFT JOIN Brands b ON ct.ReferenceType = 'BRAND' AND ct.ReferenceID = b.BrandID
            LEFT JOIN Factories f ON ct.ReferenceType = 'FACTORY' AND ct.ReferenceID = f.FactoryID
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY ct.CreatedAt DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;

        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total for the filtered versements
        const totalQuery = `
            SELECT COALESCE(SUM(ct.Amount), 0) as total
            FROM CashTransactions ct
            WHERE ${whereConditions.join(' AND ')}
        `;
        const totalResult = await pool.query(totalQuery, params.slice(0, -2));

        res.json({
            success: true,
            data: result.rows,
            total: parseFloat(totalResult.rows[0]?.total) || 0
        });
    } catch (error) {
        console.error('Error fetching supplier versements:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des versements fournisseur', error: error.message });
    }
};

module.exports = {
    getCashAccounts,
    createCashAccount,
    deleteCashAccount,
    setDefaultCashAccount,
    getCashTransactions,
    createCashTransaction,
    getCashSummary,
    createCashTransfer,
    getAccountJournal,
    getClientVersements,
    getSupplierVersements,
    updateCashTransaction,
    deleteCashTransaction
};

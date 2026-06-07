-- ========================================
-- ACCOUNTING MODULE - CASH ACCOUNTS & TRANSACTIONS
-- ========================================

-- Drop existing tables if any (for re-runs)
DROP TABLE IF EXISTS CashTransactions CASCADE;
DROP TABLE IF EXISTS CashAccounts CASCADE;

-- Cash Accounts (Comptes de Caisse)
CREATE TABLE CashAccounts (
    AccountID SERIAL PRIMARY KEY,
    AccountName VARCHAR(100) NOT NULL,
    Description TEXT,
    Balance DECIMAL(15,2) DEFAULT 0.00,
    IsDefault BOOLEAN DEFAULT FALSE,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cash Transactions
CREATE TABLE CashTransactions (
    TransactionID SERIAL PRIMARY KEY,
    AccountID INT REFERENCES CashAccounts(AccountID) ON DELETE CASCADE,
    TransactionType VARCHAR(30) NOT NULL CHECK (TransactionType IN (
        'VENTE', 'ACHAT', 'RETOUR_VENTE', 'RETOUR_ACHAT', 
        'ENCAISSEMENT', 'DECAISSEMENT', 'VERSEMENT', 'PAIEMENT', 'CHARGE', 'TRANSFERT'
    )),
    Amount DECIMAL(15,2) NOT NULL,
    Tiers VARCHAR(200), -- Customer/Supplier name
    Motif TEXT, -- Reason/Reference (e.g., "Vente N° 1201")
    ReferenceType VARCHAR(50), -- 'ORDER', 'PURCHASE', etc.
    ReferenceID INT, -- OrderID, etc.
    ChargeType VARCHAR(50), -- For CHARGE transactions
    Notes TEXT,
    CreatedBy INT REFERENCES Users(UserID),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_cash_trans_account ON CashTransactions(AccountID);
CREATE INDEX idx_cash_trans_type ON CashTransactions(TransactionType);
CREATE INDEX idx_cash_trans_date ON CashTransactions(CreatedAt);
CREATE INDEX idx_cash_trans_tiers ON CashTransactions(Tiers);
CREATE INDEX idx_cash_account_default ON CashAccounts(IsDefault);
CREATE INDEX idx_cash_account_active ON CashAccounts(IsActive);

-- Trigger for UpdatedAt on CashAccounts
CREATE TRIGGER trg_cash_accounts_updated_at BEFORE UPDATE ON CashAccounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default cash account
INSERT INTO CashAccounts (AccountName, Description, IsDefault, Balance) 
VALUES ('CAISSE PRINCIPALE', 'Compte de caisse principal', TRUE, 0.00);

-- ========================================
-- END ACCOUNTING SCHEMA
-- ========================================

-- =========================================================
-- SCRIPT DE RÉINITIALISATION DES TRANSACTIONS ET SOLDES
-- =========================================================

-- Désactiver temporairement les contraintes pour permettre les truncates rapides
SET session_replication_role = 'replica';

-- =========================================================
-- 1. VIDER LES TRANSACTIONS FINANCIÈRES
-- =========================================================
TRUNCATE TABLE CashTransactions CASCADE;
TRUNCATE TABLE PaymentAllocations CASCADE;
TRUNCATE TABLE Payments CASCADE;
TRUNCATE TABLE AccountingEntries CASCADE;
TRUNCATE TABLE SettlementItems CASCADE;
TRUNCATE TABLE FactorySettlements CASCADE;

-- =========================================================
-- 2. VIDER LES VENTES ET LOGISTIQUE
-- =========================================================
TRUNCATE TABLE Deliveries CASCADE;
TRUNCATE TABLE ReturnItems CASCADE;
TRUNCATE TABLE Returns CASCADE;
TRUNCATE TABLE Invoices CASCADE;
TRUNCATE TABLE OrderItems CASCADE;
TRUNCATE TABLE Orders CASCADE;

-- =========================================================
-- 3. VIDER LES ACHATS ET STOCKS
-- =========================================================
TRUNCATE TABLE GoodsReceiptItems CASCADE;
TRUNCATE TABLE GoodsReceipts CASCADE;
TRUNCATE TABLE PurchaseOrderItems CASCADE;
TRUNCATE TABLE PurchaseOrders CASCADE;
TRUNCATE TABLE InventoryTransactions CASCADE;

-- =========================================================
-- 4. VIDER LES LOGS ET SESSIONS
-- =========================================================
-- Si la table existe (feature récente)
DO $$ BEGIN
    TRUNCATE TABLE ActiveSessions CASCADE;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table ActiveSessions does not exist, skipping.';
END $$;

TRUNCATE TABLE AuditLogs CASCADE;

-- =========================================================
-- 5. RÉINITIALISER LES SOLDES (Rest)
-- =========================================================

-- Clients
UPDATE Customers SET CurrentBalance = 0.00, UpdatedAt = CURRENT_TIMESTAMP;

-- Caisses
UPDATE CashAccounts SET Balance = 0.00, UpdatedAt = CURRENT_TIMESTAMP;

-- Fournisseurs (Si applicable dans le futur, pour l'instant via FactorySettlements/PurchaseOrders)

-- =========================================================
-- 6. RÉINITIALISER LES SÉQUENCES
-- =========================================================

ALTER SEQUENCE orders_seq RESTART WITH 1;
ALTER SEQUENCE po_seq RESTART WITH 1;
ALTER SEQUENCE gr_seq RESTART WITH 1;
-- Si la sequence existe
DO $$ BEGIN
    ALTER SEQUENCE returns_seq RESTART WITH 1;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Sequence returns_seq does not exist, skipping.';
END $$;

-- Réactiver les contraintes
SET session_replication_role = 'origin';

-- =========================================================
-- VÉRIFICATION
-- =========================================================
SELECT 'Orders' as Table, COUNT(*) as Count FROM Orders
UNION ALL SELECT 'PurchaseOrders', COUNT(*) FROM PurchaseOrders
UNION ALL SELECT 'Payments', COUNT(*) FROM Payments
UNION ALL SELECT 'Invoices', COUNT(*) FROM Invoices;

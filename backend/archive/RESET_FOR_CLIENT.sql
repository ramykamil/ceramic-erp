-- =========================================================
-- SCRIPT DE RÉINITIALISATION POUR LIVRAISON CLIENT
-- Exécutez ce script UNE SEULE FOIS dans pgAdmin 4
-- ATTENTION: Cette opération est IRRÉVERSIBLE!
-- =========================================================

-- =========================================================
-- 1. SUPPRIMER TOUTES LES DONNÉES TRANSACTIONNELLES
-- (Respecte l'ordre des contraintes FK)
-- =========================================================

-- Désactiver temporairement les contraintes (optionnel, pour plus de sécurité)
SET session_replication_role = 'replica';

-- Vider les tables de transactions comptables
TRUNCATE TABLE CashTransactions CASCADE;
TRUNCATE TABLE PaymentAllocations CASCADE;
TRUNCATE TABLE Payments CASCADE;
TRUNCATE TABLE AccountingEntries CASCADE;

-- Vider les tables de livraison
TRUNCATE TABLE Deliveries CASCADE;

-- Vider les tables de retours
TRUNCATE TABLE ReturnItems CASCADE;
TRUNCATE TABLE Returns CASCADE;

-- Vider les tables de commandes
TRUNCATE TABLE OrderItems CASCADE;
TRUNCATE TABLE Orders CASCADE;
TRUNCATE TABLE Invoices CASCADE;

-- Vider les tables d'achat
TRUNCATE TABLE GoodsReceiptItems CASCADE;
TRUNCATE TABLE GoodsReceipts CASCADE;
TRUNCATE TABLE PurchaseOrderItems CASCADE;
TRUNCATE TABLE PurchaseOrders CASCADE;

-- Vider les règlements usine
TRUNCATE TABLE SettlementItems CASCADE;
TRUNCATE TABLE FactorySettlements CASCADE;

-- Vider les transactions d'inventaire (historique seulement)
TRUNCATE TABLE InventoryTransactions CASCADE;

-- Vider les sessions actives
TRUNCATE TABLE ActiveSessions CASCADE;

-- Vider les logs d'audit
TRUNCATE TABLE AuditLogs CASCADE;

-- Réactiver les contraintes
SET session_replication_role = 'origin';

-- =========================================================
-- 2. RÉINITIALISER LES SOLDES
-- =========================================================

-- Remettre tous les soldes clients à 0
UPDATE Customers SET CurrentBalance = 0.00, UpdatedAt = CURRENT_TIMESTAMP;

-- Remettre tous les soldes de caisse à 0
UPDATE CashAccounts SET Balance = 0.00, UpdatedAt = CURRENT_TIMESTAMP;

-- =========================================================
-- 3. RÉINITIALISER LES SÉQUENCES (Numéros recommencent à 1)
-- =========================================================

ALTER SEQUENCE orders_seq RESTART WITH 1;
ALTER SEQUENCE po_seq RESTART WITH 1;
ALTER SEQUENCE gr_seq RESTART WITH 1;
ALTER SEQUENCE returns_seq RESTART WITH 1;

-- =========================================================
-- 4. VÉRIFICATION FINALE
-- =========================================================

SELECT 'Orders' as Table_Name, COUNT(*) as Row_Count FROM Orders
UNION ALL SELECT 'OrderItems', COUNT(*) FROM OrderItems
UNION ALL SELECT 'Returns', COUNT(*) FROM Returns
UNION ALL SELECT 'CashTransactions', COUNT(*) FROM CashTransactions
UNION ALL SELECT 'InventoryTransactions', COUNT(*) FROM InventoryTransactions
UNION ALL SELECT 'Deliveries', COUNT(*) FROM Deliveries
UNION ALL SELECT 'PurchaseOrders', COUNT(*) FROM PurchaseOrders;

-- Vérifier les soldes clients
SELECT 'Customer Balances Reset' as Check_Item, 
       CASE WHEN SUM(CurrentBalance) = 0 THEN 'OK' ELSE 'WARNING' END as Status
FROM Customers;

-- Vérifier que les produits sont préservés
SELECT 'Products Preserved' as Check_Item, 
       CASE WHEN COUNT(*) > 0 THEN 'OK (' || COUNT(*)::TEXT || ' products)' ELSE 'EMPTY' END as Status
FROM Products WHERE IsActive = TRUE;

-- Vérifier que les clients sont préservés
SELECT 'Customers Preserved' as Check_Item, 
       CASE WHEN COUNT(*) > 0 THEN 'OK (' || COUNT(*)::TEXT || ' customers)' ELSE 'EMPTY' END as Status
FROM Customers WHERE IsActive = TRUE;

-- =========================================================
-- TERMINÉ - L'application est prête pour le client!
-- =========================================================

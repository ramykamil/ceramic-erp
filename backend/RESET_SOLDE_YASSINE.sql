-- Rénitialiser le solde du client YASSINE CHAT à 0
UPDATE Customers
SET CurrentBalance = 0.00, UpdatedAt = CURRENT_TIMESTAMP
WHERE CustomerName = 'YASSINE CHAT';

-- Vérification
SELECT CustomerName, CurrentBalance 
FROM Customers 
WHERE CustomerName = 'YASSINE CHAT';

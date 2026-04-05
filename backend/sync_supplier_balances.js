
const pool = require('./src/config/database');

async function syncBalances() {
    console.log("Syncing Supplier Balances...");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Sync BRANDS
        console.log("Syncing Brands...");
        await client.query(`
            UPDATE Brands b
            SET CurrentBalance = COALESCE(b.InitialBalance, 0) + (
                -- 1. Total Purchased (POs)
                COALESCE((
                    SELECT SUM(po.TotalAmount)
                    FROM PurchaseOrders po
                    WHERE po.BrandID = b.BrandID 
                    AND po.Status != 'CANCELLED'
                ), 0)
                -
                -- 2. Total Payments (via POs or Direct)
                COALESCE((
                    SELECT SUM(ct.Amount)
                    FROM CashTransactions ct
                    LEFT JOIN PurchaseOrders po ON ct.ReferenceID = po.PurchaseOrderID AND ct.ReferenceType = 'PURCHASE'
                    WHERE ct.TransactionType IN ('ACHAT', 'PAIEMENT')
                    AND (
                        (ct.ReferenceType = 'BRAND' AND ct.ReferenceID = b.BrandID)
                        OR
                        (ct.ReferenceType = 'PURCHASE' AND po.BrandID = b.BrandID)
                    )
                ), 0)
                +
                -- 3. Total Refunds/Income (Increases Debt/Balance)
                COALESCE((
                    SELECT SUM(ct.Amount)
                    FROM CashTransactions ct
                    LEFT JOIN PurchaseOrders po ON ct.ReferenceID = po.PurchaseOrderID AND ct.ReferenceType = 'PURCHASE'
                    WHERE (ct.TransactionType = 'RETOUR_ACHAT' OR ct.TransactionType = 'ENCAISSEMENT') -- Encaissement might be generic, stick to RETOUR_ACHAT?
                    AND (
                        (ct.ReferenceType = 'BRAND' AND ct.ReferenceID = b.BrandID)
                        OR
                        (ct.ReferenceType = 'PURCHASE' AND po.BrandID = b.BrandID)
                    )
                ), 0)
            )
        `);

        // 2. Sync FACTORIES
        console.log("Syncing Factories...");
        await client.query(`
            UPDATE Factories f
            SET CurrentBalance = COALESCE(f.InitialBalance, 0) + (
                COALESCE((
                    SELECT SUM(po.TotalAmount)
                    FROM PurchaseOrders po
                    WHERE po.FactoryID = f.FactoryID 
                    AND po.Status != 'CANCELLED'
                ), 0)
                -
                COALESCE((
                    SELECT SUM(ct.Amount)
                    FROM CashTransactions ct
                    LEFT JOIN PurchaseOrders po ON ct.ReferenceID = po.PurchaseOrderID AND ct.ReferenceType = 'PURCHASE'
                    WHERE ct.TransactionType IN ('ACHAT', 'PAIEMENT')
                    AND (
                        (ct.ReferenceType = 'FACTORY' AND ct.ReferenceID = f.FactoryID)
                        OR
                        (ct.ReferenceType = 'PURCHASE' AND po.FactoryID = f.FactoryID)
                    )
                ), 0)
                +
                COALESCE((
                    SELECT SUM(ct.Amount)
                    FROM CashTransactions ct
                    LEFT JOIN PurchaseOrders po ON ct.ReferenceID = po.PurchaseOrderID AND ct.ReferenceType = 'PURCHASE'
                    WHERE ct.TransactionType = 'RETOUR_ACHAT'
                    AND (
                        (ct.ReferenceType = 'FACTORY' AND ct.ReferenceID = f.FactoryID)
                        OR
                        (ct.ReferenceType = 'PURCHASE' AND po.FactoryID = f.FactoryID)
                    )
                ), 0)
            )
        `);

        await client.query('COMMIT');
        console.log("Sync Complete.");

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error syncing balances:", e);
    } finally {
        client.release();
        pool.end();
    }
}

syncBalances();

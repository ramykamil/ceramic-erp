const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function globalRepair() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('--- Starting Global Inventory Repair (Zero-Conversion) ---');

        // 1. Repair Goods Receipt Transactions
        console.log('Repairing Goods Receipt transactions...');
        const grRepair = await client.query(`
            UPDATE InventoryTransactions it
            SET Quantity = gri.QuantityReceived,
                Notes = COALESCE(it.Notes, '') || ' [Global Zero-Conversion Repair]'
            FROM GoodsReceiptItems gri
            WHERE it.ReferenceID = gri.ReceiptID 
              AND it.ProductID = gri.ProductID
              AND it.ReferenceType = 'GOODS_RECEIPT'
              AND it.TransactionType = 'IN'
              AND ABS(it.Quantity - gri.QuantityReceived) > 0.001
            RETURNING it.ProductID
        `);
        console.log(`Reconciled ${grRepair.rowCount} Goods Receipt transactions.`);

        // 2. Repair Sales Order Transactions
        console.log('Repairing Sales Order transactions...');
        const ordRepair = await client.query(`
            UPDATE InventoryTransactions it
            SET Quantity = oi.Quantity,
                Notes = COALESCE(it.Notes, '') || ' [Global Zero-Conversion Repair]'
            FROM OrderItems oi
            WHERE it.ReferenceID = oi.OrderID 
              AND it.ProductID = oi.ProductID
              AND it.ReferenceType = 'ORDER'
              AND it.TransactionType = 'OUT'
              AND ABS(it.Quantity - oi.Quantity) > 0.001
            RETURNING it.ProductID
        `);
        console.log(`Reconciled ${ordRepair.rowCount} Sales Order transactions.`);

        // 3. Identify all products that need re-calculation
        const affectedProductIds = new Set();
        grRepair.rows.forEach(r => affectedProductIds.add(r.productid));
        ordRepair.rows.forEach(r => affectedProductIds.add(r.productid));

        console.log(`Recalculating inventory balance for ${affectedProductIds.size} products...`);

        for (const pid of affectedProductIds) {
            const balanceResult = await client.query(`
                SELECT 
                    SUM(CASE WHEN TransactionType = 'IN' THEN Quantity ELSE -Quantity END) as real_balance
                FROM InventoryTransactions
                WHERE ProductID = $1
            `, [pid]);

            const realBalance = parseFloat(balanceResult.rows[0].real_balance) || 0;
            
            const productPkg = await client.query(`SELECT QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1`, [pid]);
            
            if (productPkg.rows.length === 0) {
                console.warn(`Product ${pid} not found in Products table. Skipping inventory record update.`);
                continue;
            }

            const { qteparcolis, qtecolisparpalette } = productPkg.rows[0];
            
            const ppc = parseFloat(qteparcolis) || 0;
            const cpp = parseFloat(qtecolisparpalette) || 0;
            const newColis = ppc > 0 ? parseFloat((realBalance / ppc).toFixed(4)) : 0;
            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

            await client.query(`
                UPDATE Inventory 
                SET QuantityOnHand = $1,
                    ColisCount = $2,
                    PalletCount = $3,
                    UpdatedAt = CURRENT_TIMESTAMP
                WHERE ProductID = $4
            `, [realBalance, newColis, newPallets, pid]);
        }

        await client.query('COMMIT');
        console.log('--- Global Repair completed successfully ---');

        // 4. Refresh Materialized Views
        try {
            console.log('Refreshing mv_Catalogue...');
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('Done.');
        } catch (e) {
            console.warn('Could not refresh mv_Catalogue:', e.message);
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('CRITICAL ERROR during global repair:', e);
    } finally {
        client.release();
        pool.end();
    }
}

globalRepair();

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const targets = [
  { transId: 24055, expected: 881.28, productId: 141 },
  { transId: 24056, expected: 140.00, productId: 7747 },
  { transId: 24057, expected: 140.00, productId: 7748 },
  { transId: 24060, expected: 829.44, productId: 141 },
  { transId: 24061, expected: 210.00, productId: 7748 },
  { transId: 24062, expected: 210.00, productId: 7747 },
  { transId: 24086, expected: 1224.72, productId: 7750 },
  { transId: 24130, expected: 1140.48, productId: 141 }
];

async function fixAll() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('--- Resuming Bulk Inventory Correction (Zero Conversion) ---');

        for (const target of targets) {
            const result = await client.query(`
                UPDATE InventoryTransactions 
                SET Quantity = $1, 
                    Notes = COALESCE(Notes, '') || ' [Zero-Conversion Reconciled]'
                WHERE TransactionID = $2
                RETURNING ProductID
            `, [target.expected, target.transId]);

            if (result.rows.length > 0) {
                console.log(`Corrected Transaction #${target.transId} for Product ${target.productId} to ${target.expected}`);
            }
        }

        // 2. Recalculate Inventory for all affected products
        const uniqueProductIds = [...new Set(targets.map(t => t.productId))];
        
        for (const pid of uniqueProductIds) {
            const balanceResult = await client.query(`
                SELECT 
                    SUM(CASE WHEN TransactionType = 'IN' THEN Quantity ELSE -Quantity END) as real_balance
                FROM InventoryTransactions
                WHERE ProductID = $1
            `, [pid]);

            const realBalance = parseFloat(balanceResult.rows[0].real_balance) || 0;
            
            const productPkg = await client.query(`SELECT QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1`, [pid]);
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
            
            console.log(`Updated Inventory for Product ${pid}: Qty=${realBalance.toFixed(2)}, Pallets=${newPallets.toFixed(2)}`);
        }

        await client.query('COMMIT');
        console.log('--- All discrepancies reconciled successfully ---');

        // Refresh view
        try {
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        } catch (e) {}

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

fixAll();

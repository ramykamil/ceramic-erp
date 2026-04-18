const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixInventory() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const productId = 4945; // STANLY MARFIL TERRE CUITE 45/45
        const sqmPerPiece = 0.2025;

        console.log(`Starting inventory correction for product ${productId}...`);

        // 1. Identify and Correct inflated Transactions
        // GR 419: 874.80 SQM -> recorded as 4320.00
        // GR 422: 1166.40 SQM -> recorded as 5760.00
        // ORD 2042: 6.075 SQM -> recorded as 30.00

        const targets = [
            { refType: 'GOODS_RECEIPT', refId: 419, expected: 874.80, inflated: 4320.00 },
            { refType: 'GOODS_RECEIPT', refId: 422, expected: 1166.40, inflated: 5760.00 },
            { refType: 'ORDER', refId: 2042, expected: 6.075, inflated: 30.00 }
        ];

        for (const target of targets) {
            const result = await client.query(`
                UPDATE InventoryTransactions 
                SET Quantity = $1, 
                    Notes = COALESCE(Notes, '') || ' [Retroactive Correction: SQM/PCS confusion fixed]'
                WHERE ProductID = $2 
                  AND ReferenceType = $3 
                  AND ReferenceID = $4
                  AND ABS(Quantity - $5) < 0.01
                RETURNING TransactionID, Quantity
            `, [target.expected, productId, target.refType, target.refId, target.inflated]);

            if (result.rows.length > 0) {
                console.log(`Corrected ${target.refType} #${target.refId}: ${target.inflated} -> ${target.expected}`);
            } else {
                console.warn(`Could not find transaction for ${target.refType} #${target.refId} with quantity ${target.inflated}`);
            }
        }

        // 2. Recalculate Inventory.QuantityOnHand
        // We sum all transactions for this product to get the true balance
        const balanceResult = await client.query(`
            SELECT 
                SUM(CASE WHEN TransactionType = 'IN' THEN Quantity ELSE -Quantity END) as real_balance
            FROM InventoryTransactions
            WHERE ProductID = $1
        `, [productId]);

        const realBalance = parseFloat(balanceResult.rows[0].real_balance) || 0;
        console.log(`Calculated real balance: ${realBalance.toFixed(4)} SQM`);

        // 3. Update Inventory table
        // We also need the packaging info for pallet/colis counts
        const productResult = await client.query(`SELECT QteParColis, QteColisParPalette FROM Products WHERE ProductID = $1`, [productId]);
        const { qteparcolis, qtecolisparpalette } = productResult.rows[0];
        
        const ppc = parseFloat(qteparcolis) || 0;
        const cpp = parseFloat(qtecolisparpalette) || 0;
        const newColis = ppc > 0 ? parseFloat((realBalance / ppc).toFixed(4)) : 0;
        const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

        const invUpdate = await client.query(`
            UPDATE Inventory 
            SET QuantityOnHand = $1,
                ColisCount = $2,
                PalletCount = $3,
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE ProductID = $4
            RETURNING *
        `, [realBalance, newColis, newPallets, productId]);

        if (invUpdate.rows.length > 0) {
            console.log(`Updated Inventory record: Qty=${realBalance}, Pallets=${newPallets}, Colis=${newColis}`);
        } else {
            console.error(`Inventory record not found for product ${productId}`);
        }

        // 4. Update Product PrimaryUnitID to SQM (3) if not already
        await client.query(`UPDATE Products SET PrimaryUnitID = 3 WHERE ProductID = $1`, [productId]);

        await client.query('COMMIT');
        console.log('Correction completed successfully.');

        // 5. Refresh Materialized View
        try {
            await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('Materialized view mv_Catalogue refreshed.');
        } catch (e) {
            console.warn('Could not refresh mv_Catalogue (non-critical):', e.message);
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error during inventory correction:', e);
    } finally {
        client.release();
        pool.end();
    }
}

fixInventory();

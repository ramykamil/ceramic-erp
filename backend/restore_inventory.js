require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const TARGET_PRODUCTS = [
    // 3 zeroed products
    "BARCELONA OCRE 20/75",
    "ACRA BEIGE REC 60/60",
    "SWISS BEIGE REC 60/60",
    // Group A (Older Transactions that didn't sync well) + Group C (Over-corrected by fix scripts)
    "ASCOT ROJO 20/75",
    "BERLIN BEIGE 45/45",
    "COSTA WHITE REC 60/60",
    "COTTO ROJO TERRE CUITE 45/45",
    "EUROPA MATT 45/90 DECO",
    "KING CREMA 45/90",
    "ROMA BLANC 30/90",
    "VICTORIA EXTRA REC 60/60",
    "STYLE 25/75",
    "PROSTYLE MARFIL 45/90",
    "MELINA MARFIL REC 60/60",
    "MIRNA EXTRA REC 60/60",
    "MAUREEN BLACK POLI REC 120/60",
    "DRAGON GREEN POLI REC 120/60",
    "ACRA GRIS 45/90",
    "EUROPA REC 60/60",
    "KING IVORY RELIEFE 45/90",
    "TECHNO CERAM_NEW_E985", // RIVEL NATUREL 20/75
    "BIJOUX PERLA POLI REC 60/60",
    "CAIRO 33/33",
    "DRAGON POLI REC 120/60",
    "ROLEX GRIS POLI REC 60/60",
    "VENAS 45/45"
];

// IDs of the 2 bad adjustment scripts run on March 4 and March 5
// March 4 ~11:45: "Bulk fix: Recalculated from GoodsReceipt"
// March 5 ~09:10: "Fix: Recalculated from Import + Correct_"
const BAD_NOTES = [
    'Bulk fix: Recalculated from GoodsReceipt',
    'Fix: Recalculated from Import + Correct_'
];

async function main() {
    const client = await pool.connect();

    let report = '=== INVENTORY RESTORATION REPORT ===\n\n';

    try {
        await client.query('BEGIN');

        for (const productName of TARGET_PRODUCTS) {
            console.log(`\nProcessing: ${productName}`);

            // Get product
            const result = await client.query('SELECT ProductID, ProductCode, ProductName FROM Products WHERE UPPER(ProductName) = UPPER($1) OR ProductCode = $1', [productName]);
            if (result.rows.length === 0) {
                console.log(`  -> Not found in DB.`);
                continue;
            }

            const p = result.rows[0];

            // Get true transactions (excluding the known bad scripts)
            const txs = await client.query(`
                SELECT TransactionType, Quantity, Notes, ReferenceType, CreatedAt
                FROM InventoryTransactions
                WHERE ProductID = $1
            `, [p.productid]);

            let trueRunningTotal = 0;
            let goodTxsCount = 0;
            let badTxsCount = 0;

            for (const tx of txs.rows) {
                // Ignore the bad recalculation scripts
                if (tx.referencetype === 'MANUAL_ADJUSTMENT' &&
                    tx.notes && BAD_NOTES.some(badNote => tx.notes.startsWith(badNote))) {
                    badTxsCount++;
                    continue; // Skip these in our true total calculation
                }

                goodTxsCount++;
                const qty = parseFloat(tx.quantity) || 0;

                if (tx.transactiontype === 'IN') {
                    trueRunningTotal += qty;
                } else if (tx.transactiontype === 'OUT') {
                    trueRunningTotal -= qty;
                } else if (tx.transactiontype === 'ADJUSTMENT') {
                    trueRunningTotal += qty;
                }
            }

            // Get current DB inventory
            const invResult = await client.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1', [p.productid]);
            const currentStock = invResult.rows.length > 0 ? parseFloat(invResult.rows[0].quantityonhand) : 0;

            console.log(`  True Calculated Total: ${trueRunningTotal.toFixed(2)}  |  Current DB Stock: ${currentStock.toFixed(2)}`);
            console.log(`  Based on ${goodTxsCount} valid transactions (ignored ${badTxsCount} bad auto-adjustments)`);

            const diff = trueRunningTotal - currentStock;

            if (Math.abs(diff) > 0.001) {
                console.log(`  Need to adjust by: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`);

                // 1. Actually update the Inventory table
                if (invResult.rows.length === 0) {
                    await client.query(`
                        INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, QuantityReserved, UpdatedAt)
                        VALUES ($1, 1, 'OWNED', $2, 0, CURRENT_TIMESTAMP)
                    `, [p.productid, trueRunningTotal]);
                } else {
                    await client.query(`
                        UPDATE Inventory 
                        SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP
                        WHERE ProductID = $2
                    `, [trueRunningTotal, p.productid]);
                }

                // 2. Insert correction transaction so history matches
                await client.query(`
                    INSERT INTO InventoryTransactions (
                        ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes, CreatedBy
                    ) VALUES (
                        $1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', NULL, 'Fix: Restoring true ledger total (reverting bad scripts)', 1
                    )
                `, [p.productid, diff]);

                report += `[${p.productcode}] ${p.productname}\n`;
                report += `  Previous DB Stock: ${currentStock.toFixed(2)}\n`;
                report += `  True Ledger Total: ${trueRunningTotal.toFixed(2)}\n`;
                report += `  Adjustment Applied: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}\n\n`;
                console.log('  -> Fix applied successfully.');
            } else {
                console.log(`  -> Already correct, no fix needed.`);
            }
        }

        await client.query('COMMIT');
        fs.writeFileSync('restoration_report.txt', report);
        console.log('\n\n✅ ALL FIXES COMMITTED SUCCESSFULLY. See restoration_report.txt');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ERROR during restoration:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

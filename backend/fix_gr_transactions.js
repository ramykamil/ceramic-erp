/**
 * FIX GR INVENTORY TRANSACTIONS — Convert PCS to correct SQM
 * ============================================================
 * The old GR controller bug recorded quantities in PCS instead of SQM
 * in the InventoryTransactions table. This script:
 * 1. Finds all IN/GOODS_RECEIPT transactions
 * 2. Looks up the GoodsReceiptItems to get the raw PCS received
 * 3. Computes the correct SQM using tile dimensions
 * 4. Updates the InventoryTransaction quantity to the correct SQM
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function parseDimensions(str) {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
    if (match) return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    return 0;
}

async function main() {
    const client = await pool.connect();

    try {
        // Get ALL remaining IN/GOODS_RECEIPT transactions (only post-03-03 remain after purge)
        const txns = await client.query(`
            SELECT it.TransactionID, it.ProductID, it.Quantity, it.ReferenceID as ReceiptID,
                   p.ProductName, p.Size, p.QteParColis, p.QteColisParPalette
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            WHERE it.TransactionType = 'IN' AND it.ReferenceType = 'GOODS_RECEIPT'
            ORDER BY it.TransactionID
        `);

        console.log(`Found ${txns.rows.length} GR inventory transactions to check.\n`);

        await client.query('BEGIN');
        let fixedCount = 0;
        let alreadyCorrect = 0;

        for (const tx of txns.rows) {
            // Look up the GoodsReceiptItem to get raw received qty and unit
            const griRes = await client.query(`
                SELECT gri.QuantityReceived, gri.UnitID, u.UnitCode
                FROM GoodsReceiptItems gri
                LEFT JOIN Units u ON gri.UnitID = u.UnitID
                WHERE gri.ReceiptID = $1 AND gri.ProductID = $2
                LIMIT 1
            `, [tx.receiptid, tx.productid]);

            if (griRes.rows.length === 0) {
                console.log(`  [SKIP] TxnID ${tx.transactionid} — no GoodsReceiptItem found`);
                continue;
            }

            const gri = griRes.rows[0];
            const rawQty = parseFloat(gri.quantityreceived) || 0;
            const unitCode = (gri.unitcode || '').toUpperCase();
            const sqmPerPiece = parseDimensions(tx.size || tx.productname);
            const isFiche = (tx.productname || '').toLowerCase().startsWith('fiche');
            const isTile = !isFiche && sqmPerPiece > 0;
            const ppc = parseFloat(tx.qteparcolis) || 0;
            const cpp = parseFloat(tx.qtecolisparpalette) || 0;

            let correctQty = rawQty;

            if (isTile) {
                if (['SQM', 'M2', 'M²'].includes(unitCode)) {
                    correctQty = rawQty; // Already SQM
                } else if (['PCS', 'PIECE', 'PIÈCE'].includes(unitCode)) {
                    correctQty = rawQty * sqmPerPiece; // PCS → SQM
                } else if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode)) {
                    const pcs = ppc > 0 ? rawQty * ppc : rawQty;
                    correctQty = pcs * sqmPerPiece;
                } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode)) {
                    const boxes = cpp > 0 ? rawQty * cpp : rawQty;
                    const pcs = ppc > 0 ? boxes * ppc : boxes;
                    correctQty = pcs * sqmPerPiece;
                }
            } else {
                // Non-tile
                if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode) && ppc > 0) {
                    correctQty = rawQty * ppc;
                } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode) && cpp > 0 && ppc > 0) {
                    correctQty = rawQty * cpp * ppc;
                }
            }

            const currentQty = parseFloat(tx.quantity);
            if (Math.abs(currentQty - correctQty) < 0.01) {
                alreadyCorrect++;
                continue;
            }

            // Update the transaction
            await client.query(
                'UPDATE InventoryTransactions SET Quantity = $1 WHERE TransactionID = $2',
                [correctQty, tx.transactionid]
            );

            fixedCount++;
            console.log(`  [FIX] ${tx.productname}: ${currentQty.toFixed(2)} → ${correctQty.toFixed(2)} (was ${unitCode} raw=${rawQty})`);
        }

        await client.query('COMMIT');
        console.log(`\n✅ Done. Fixed: ${fixedCount}, Already correct: ${alreadyCorrect}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ERROR:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

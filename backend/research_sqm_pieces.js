const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function scan() {
    try {
        console.log('--- Starting High-Speed SQM-Piece Discrepancy Scan ---');
        
        // This query finds all transactions for SQM products where the quantity in inventory
        // doesn't match the quantity in the Goods Receipt form (SQM), and looks suspiciously like PIECES.
        const query = `
            WITH Candidates AS (
                SELECT p.ProductID, p.ProductName, p.Size, p.QteParColis,
                       CASE 
                           WHEN p.Size ~ '(\\d+)\\s*[xX*\\/]\\s*(\\d+)' 
                           THEN (substring(p.Size from '(\\d+)')::numeric * substring(p.Size from '(\\d+)$')::numeric) / 10000 
                           WHEN p.ProductName ~ '(\\d+)\\s*[xX*\\/]\\s*(\\d+)' 
                           THEN (substring(p.ProductName from '(\\d+)')::numeric * substring(p.ProductName from '(\\d+)\\s*$')::numeric) / 10000
                           ELSE 0 
                       END as sqmPerPiece
                FROM Products p
                JOIN Units u ON p.PrimaryUnitID = u.UnitID
                WHERE u.UnitCode IN ('SQM', 'M2', 'M²')
            )
            SELECT 
                it.TransactionID, it.ProductID, it.Quantity as it_qty, it.ReferenceID, it.CreatedAt,
                gri.QuantityReceived as gri_qty,
                c.ProductName, c.sqmPerPiece
            FROM InventoryTransactions it
            JOIN Candidates c ON it.ProductID = c.ProductID
            LEFT JOIN GoodsReceiptItems gri ON it.ReferenceID = gri.ReceiptID AND it.ReferenceType = 'GOODS_RECEIPT' AND it.ProductID = gri.ProductID
            WHERE it.CreatedAt >= '2026-04-10'
              AND it.TransactionType = 'IN'
              AND c.sqmPerPiece > 0
        `;

        const res = await pool.query(query);
        console.log(`Analyzing ${res.rows.length} transactions...`);

        const findings = [];
        for (const row of res.rows) {
            const itQty = parseFloat(row.it_qty);
            const griQty = parseFloat(row.gri_qty);
            const factor = 1 / row.sqmPerPiece;

            // If it_qty is roughly griQty * factor, it was converted SQM -> PCS incorrectly
            if (griQty > 0 && Math.abs(itQty - (griQty / row.sqmPerPiece)) < 1.0) {
                findings.push({
                    productId: row.productid,
                    name: row.productname,
                    transId: row.transactionid,
                    invQty: itQty,
                    griQty: griQty,
                    sqmPerPiece: row.sqmPerPiece,
                    ratio: itQty / griQty,
                    shouldBeFactor: 1 / row.sqmPerPiece
                });
            }
        }

        console.log(`Scan found ${findings.length} confirmed discrepancies.`);
        console.log(JSON.stringify(findings, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

scan();

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function audit() {
    try {
        console.log('--- Starting Fast SQM-Piece Discrepancy Audit ---');
        
        const query = `
            WITH Candidates AS (
                SELECT p.ProductID, p.ProductName, p.Size,
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
                it.TransactionID, it.ProductID, it.Quantity as it_qty, it.ReferenceType, it.ReferenceID, it.CreatedAt,
                gri.QuantityReceived as gri_qty,
                c.ProductName, c.sqmPerPiece
            FROM InventoryTransactions it
            JOIN Candidates c ON it.ProductID = c.ProductID
            JOIN GoodsReceiptItems gri ON it.ReferenceID = gri.ReceiptID 
                AND it.ReferenceType = 'GOODS_RECEIPT' 
                AND it.ProductID = gri.ProductID
            WHERE it.CreatedAt >= '2026-03-01'
              AND it.TransactionType = 'IN'
              AND c.sqmPerPiece > 0
              AND c.sqmPerPiece < 1.0  -- Only products where Pieces > SQM
              AND it.Quantity > 0
              -- Look for cases where Inventory Qty is roughly GR Qty / sqmPerPiece
              AND ABS(it.Quantity - (gri.QuantityReceived / c.sqmPerPiece)) < 1.0
              AND ABS(it.Quantity - gri.QuantityReceived) > 1.0 -- Exclude correct ones
        `;

        const res = await pool.query(query);
        console.log(`Audit finished. Found ${res.rows.length} confirmed discrepancies.`);
        
        const findings = res.rows.map(row => ({
            productId: row.productid,
            name: row.productname,
            transId: row.transactionid,
            recordedQty: parseFloat(row.it_qty),
            enteredQty: parseFloat(row.gri_qty),
            sqmPerPiece: row.sqmPerPiece,
            date: row.createdat,
            ref: `${row.referencetype} #${row.referenceid}`
        }));

        console.log(JSON.stringify(findings, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

audit();

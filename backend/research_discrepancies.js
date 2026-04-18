const { Pool } = require('pg');
require('dotenv').config({ path: '../.env_utf8' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const parseDimensions = (str) => {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
    if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    }
    return 0;
};

async function scan() {
    try {
        console.log('--- Starting Efficient Discrepancy Scan ---');
        
        // Fetch all transactions from April 10 onwards for products that look like tiles and have PrimaryUnitID=1
        const query = `
            SELECT 
                it.TransactionID, it.ProductID, it.TransactionType, it.Quantity, 
                it.ReferenceType, it.ReferenceID, it.CreatedAt,
                p.ProductName, p.Size, p.PrimaryUnitID, u.UnitCode
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            JOIN Units u ON p.PrimaryUnitID = u.UnitID
            WHERE it.CreatedAt >= '2026-04-10'
              AND (u.UnitCode = 'PCS' OR u.UnitCode = 'PIECE')
              AND (p.Size ~ '(\\d{2,3})\\s*[xX*\\/]\\s*(\\d{2,3})' OR p.ProductName ~ '(\\d{2,3})\\s*[xX*\\/]\\s*(\\d{2,3})')
        `;

        const res = await pool.query(query);
        console.log(`Analyzing ${res.rows.length} transactions...`);

        const findings = [];

        for (const row of res.rows) {
            const sqmPerPiece = parseDimensions(row.size || row.productname);
            if (sqmPerPiece <= 0) continue;

            const qty = parseFloat(row.quantity);
            const inflationFactor = 1 / sqmPerPiece;

            // suspiscion criteria:
            // 1. Quantity is large and looks like it was multiplied or divided by sqmPerPiece
            // 2. Quantity is exactly what we expect for pieces if the user intended SQM
            
            // For example, if user received 1000 SQM but it was recorded as 1000 pieces (and sqmPerPiece < 1)
            // wait, if recorded as 1000, and sqmPerPiece=0.2025, pieces would be 4938.
            
            // Let's look for large transactions where quantity > 500
            if (qty > 500) {
                findings.push({
                    productId: row.productid,
                    productName: row.productname,
                    transactionId: row.transactionid,
                    type: row.transactiontype,
                    qty: qty,
                    ref: `${row.referencetype} #${row.referenceid}`,
                    date: row.createdat,
                    sqmPerPiece,
                    potentialCorrectedSqm: qty * sqmPerPiece
                });
            }
        }

        console.log(`Scan finished. Found ${findings.length} suspicious transactions.`);
        
        // Group by product for better reporting
        const report = findings.reduce((acc, f) => {
            if (!acc[f.productId]) acc[f.productId] = { name: f.productName, transactions: [] };
            acc[f.productId].transactions.push(f);
            return acc;
        }, {});

        console.log(JSON.stringify(report, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

scan();

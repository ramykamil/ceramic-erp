const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

const parseDimensions = (str) => {
    if (!str) return 0;
    const match = str.match(/(\\d{2,3})\\s*[xX*/]\\s*(\\d{2,3})/);
    if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    }
    return 0;
};

async function fixInventory() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT DISTINCT
                p.ProductID, 
                p.ProductName, 
                p.Size,
                p.QteParColis,
                p.QteColisParPalette,
                u.UnitCode as PrimaryUnit,
                i.QuantityOnHand as CurrentStock,
                i.InventoryID,
                i.WarehouseID
            FROM Products p
            JOIN Units u ON p.PrimaryUnitID = u.UnitID
            JOIN Inventory i ON p.ProductID = i.ProductID AND i.OwnershipType = 'OWNED'
            WHERE (p.Size IS NOT NULL OR p.ProductName ~ '\\d+\\s*[xX*/]\\s*\\d+')
              AND u.UnitCode IN ('PCS', 'PIECE', 'PIÈCE')
              AND p.ProductName NOT ILIKE '%fiche%'
        `);
        
        console.log('Found ' + res.rows.length + ' products to evaluate...');
        
        let updates = [];

        for (const product of res.rows) {
            const sqmPerPiece = parseDimensions(product.size || product.productname);
            if (sqmPerPiece <= 0) continue;

            const txRes = await client.query(`
                SELECT TransactionType, Quantity, ReferenceType
                FROM InventoryTransactions 
                WHERE ProductID = $1 
                  AND WarehouseID = $2
                  AND CreatedAt >= '2026-04-06 00:00:00'
                  AND ReferenceType IN ('ORDER', 'PURCHASE')
            `, [product.productid, product.warehouseid]);

            let netAddedSqm = 0;
            for (const tx of txRes.rows) {
                if (tx.transactiontype === 'IN') {
                    netAddedSqm += parseFloat(tx.quantity);
                } else if (tx.transactiontype === 'OUT') {
                    netAddedSqm -= parseFloat(tx.quantity);
                }
            }

            if (Math.abs(netAddedSqm) > 0.0001) {
                const currentStock = parseFloat(product.currentstock);
                const netAddedPieces = netAddedSqm / sqmPerPiece;
                
                // The magic reversing formula
                const truePieces = (currentStock - netAddedSqm) + netAddedPieces;

                updates.push({
                    productId: product.productid,
                    name: product.productname,
                    warehouseId: product.warehouseid,
                    currentStock: parseFloat(currentStock.toFixed(4)),
                    netAddedSqm: parseFloat(netAddedSqm.toFixed(4)),
                    netAddedPieces: parseFloat(netAddedPieces.toFixed(4)),
                    truePieces: parseFloat(truePieces.toFixed(4)),
                    diff: parseFloat((truePieces - currentStock).toFixed(4))
                });
            }
        }
        
        console.log('\n--- DRY RUN RESULTS (SAMPLE) ---');
        console.table(updates.slice(0, 10));

        let motifSweet = updates.find(u => u.productId == 3865);
        console.log('\n--- MOTIF SWEET ---');
        console.log(motifSweet);
        
        console.log('\n' + updates.length + ' inventories require correction.');

        const fs = require('fs');
        fs.writeFileSync('updates_data.json', JSON.stringify(updates, null, 2));
        console.log('Wrote updates_data.json');

    } finally {
        client.release();
        pool.end();
    }
}
fixInventory();

const fs = require('fs');
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
    let client;
    try {
        console.log('Reading affected_since_april_6.txt (UTF-16LE)...');
        const fileContent = fs.readFileSync('affected_since_april_6.txt', 'utf16le');
        
        const lines = fileContent.split('\\n');
        const productIds = [];
        for (const line of lines) {
            const match = line.match(/^│\\s+\\d+\\s+│\\s+(\\d+)\\s+│/);
            if (match && match[1]) {
                productIds.push(parseInt(match[1], 10));
            }
        }
        
        console.log('Total target products found in file:', productIds.length);
        
        client = await pool.connect();
        await client.query('BEGIN');
        
        let fixedCount = 0;
        let skippedCount = 0;
        let noSyncCount = 0;

        for (const productId of productIds) {
            // Find the anchor sync from April 7 (or late April 6 UTC)
            const syncRes = await client.query(`
                SELECT CreatedAt, Quantity 
                FROM InventoryTransactions 
                WHERE ProductID = $1 
                  AND ReferenceType = 'CATALOGUE_SYNC'
                  AND Notes ILIKE '%Sync update%'
                  AND CreatedAt BETWEEN '2026-04-06 20:00:00' AND '2026-04-07 04:00:00'
                ORDER BY CreatedAt DESC LIMIT 1
            `, [productId]);

            if (syncRes.rows.length === 0) {
                noSyncCount++;
                continue;
            }

            const syncValue = parseFloat(syncRes.rows[0].quantity);
            const syncTime = syncRes.rows[0].createdat;

            // Get product info
            const prodRes = await client.query(\`
                SELECT p.ProductName, p.Size, p.QteParColis, p.QteColisParPalette, i.QuantityOnHand
                FROM Products p
                JOIN Inventory i ON p.ProductID = i.ProductID AND i.OwnershipType = 'OWNED' AND i.WarehouseID = 1
                WHERE p.ProductID = $1
            \`, [productId]);

            if (prodRes.rows.length === 0) continue;
            const product = prodRes.rows[0];

            // Get all ORDER/PURCHASE transactions strictly AFTER this sync
            const txRes = await client.query(\`
                SELECT TransactionType, Quantity
                FROM InventoryTransactions 
                WHERE ProductID = $1 
                  AND WarehouseID = 1
                  AND CreatedAt > $2
                  AND ReferenceType IN ('ORDER', 'PURCHASE')
            \`, [productId, syncTime]);

            if (txRes.rows.length === 0) {
                skippedCount++;
                continue;
            }

            const sqmPerPiece = parseDimensions(product.size || product.productname);
            if (sqmPerPiece <= 0) {
                console.log('Skipping ' + product.productname + ' (No dimensions)');
                continue;
            }

            let netPiecesDelta = 0;
            for (const tx of txRes.rows) {
                // IMPORTANT: The quantity in the transaction was incorrectly converted to SQM
                // We convert it BACK to pieces by dividing by sqmPerPiece
                const txSqm = parseFloat(tx.quantity);
                const txPieces = txSqm / sqmPerPiece;

                if (tx.transactiontype === 'IN') {
                    netPiecesDelta += txPieces;
                } else if (tx.transactiontype === 'OUT') {
                    netPiecesDelta -= txPieces;
                }
            }

            const truePieces = syncValue + netPiecesDelta;
            const currentStock = parseFloat(product.quantityonhand);
            const diff = truePieces - currentStock;

            if (Math.abs(diff) > 0.0001) {
                // Update Inventory
                await client.query(\`
                    UPDATE Inventory 
                    SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP 
                    WHERE ProductID = $2 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
                \`, [truePieces, productId]);

                // Update Counts
                const ppc = parseFloat(product.qteparcolis) || 0;
                const cpp = parseFloat(product.qtecolisparpalette) || 0;
                const newColis = ppc > 0 ? parseFloat((truePieces / ppc).toFixed(4)) : 0;
                const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

                await client.query(\`
                    UPDATE Inventory SET ColisCount = $1, PalletCount = $2
                    WHERE ProductID = $3 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
                \`, [newColis, newPallets, productId]);

                // Audit Log
                await client.query(\`
                    INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy)
                    VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 'Retroactive correction from April 7 Sync (SQM -> PCS fix)', 1)
                \`, [productId, diff]);

                fixedCount++;
                if (productId === 3865) {
                    console.log('Fixed MOTIF SWEET [3865] | Sync: ' + syncValue + ' | Delta: ' + netPiecesDelta + ' | Result: ' + truePieces);
                }
            } else {
                skippedCount++;
            }
        }

        await client.query('COMMIT');
        
        try { await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue'); } catch(e){}
        
        console.log('\\nSUMMARY:');
        console.log('Fixed: ' + fixedCount);
        console.log('Skipped (No movement since sync): ' + skippedCount);
        console.log('Skipped (No April 7 sync found): ' + noSyncCount);

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error(err);
    } finally {
        if (client) client.release();
        pool.end();
    }
}
fixInventory();

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

async function fixAffectedProducts() {
    let client;
    try {
        console.log('Reading affected_since_april_6.txt...');
        const fileContent = fs.readFileSync('affected_since_april_6.txt', 'utf16le');
        
        // Parse the table to extract product IDs
        const lines = fileContent.split('\\n');
        const productIds = new Set();
        
        for (const line of lines) {
            // Match the table row format: | index | productid | ...
            const match = line.match(/^│\\s+\\d+\\s+│\\s+(\\d+)\\s+│/);
            if (match && match[1]) {
                productIds.add(parseInt(match[1], 10));
            }
        }
        
        console.log('Found ' + productIds.size + ' product IDs to fix.');
        
        client = await pool.connect();
        await client.query('BEGIN');
        
        let fixedCount = 0;

        for (const productId of productIds) {
            const prodRes = await client.query(`
                SELECT p.ProductID, p.ProductName, p.Size, p.QteParColis, p.QteColisParPalette,
                       i.QuantityOnHand, i.WarehouseID
                FROM Products p
                JOIN Inventory i ON p.ProductID = i.ProductID AND i.OwnershipType = 'OWNED'
                WHERE p.ProductID = $1 AND i.WarehouseID = 1
            `, [productId]);

            if (prodRes.rows.length === 0) continue;
            const product = prodRes.rows[0];

            const sqmPerPiece = parseDimensions(product.size || product.productname);
            if (sqmPerPiece <= 0) continue;

            const txRes = await client.query(`
                SELECT TransactionType, Quantity
                FROM InventoryTransactions 
                WHERE ProductID = $1 
                  AND WarehouseID = 1
                  AND CreatedAt >= '2026-04-06 00:00:00'
                  AND ReferenceType IN ('ORDER', 'PURCHASE')
            `, [productId]);

            let netAddedSqm = 0;
            for (const tx of txRes.rows) {
                if (tx.transactiontype === 'IN') {
                    netAddedSqm += parseFloat(tx.quantity);
                } else if (tx.transactiontype === 'OUT') {
                    netAddedSqm -= parseFloat(tx.quantity);
                }
            }

            if (Math.abs(netAddedSqm) > 0.0001) {
                const currentStock = parseFloat(product.quantityonhand);
                const netAddedPieces = netAddedSqm / sqmPerPiece;
                
                const truePieces = (currentStock - netAddedSqm) + netAddedPieces;
                const diff = truePieces - currentStock;

                // Update the Inventory
                await client.query(`
                    UPDATE Inventory 
                    SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP 
                    WHERE ProductID = $2 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
                `, [truePieces, productId]);

                // Recalculate Packaging logic
                const ppc = parseFloat(product.qteparcolis) || 0;
                const cpp = parseFloat(product.qtecolisparpalette) || 0;
                const newColis = ppc > 0 ? parseFloat((truePieces / ppc).toFixed(4)) : 0;
                const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

                await client.query(`
                    UPDATE Inventory SET ColisCount = $1, PalletCount = $2
                    WHERE ProductID = $3 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
                `, [newColis, newPallets, productId]);

                // Log adjusting transaction
                await client.query(`
                    INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy)
                    VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 'Automated retroactive adjustment (Reverting SQM to PCS logic)', 1)
                `, [productId, diff]);

                fixedCount++;
                console.log('Fixed Product ' + productId + ': ' + product.productname + ' -> Old: ' + currentStock.toFixed(2) + ' New: ' + truePieces.toFixed(2));
            }
        }

        await client.query('COMMIT');
        try { await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue'); } catch(e){}
        
        console.log('\\nSuccessfully fixed ' + fixedCount + ' products.');

    } catch(err) {
        if(client) await client.query('ROLLBACK');
        console.error(err);
    } finally {
        if(client) client.release();
        pool.end();
    }
}

fixAffectedProducts();

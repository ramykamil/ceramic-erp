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
        client = await pool.connect();
        
        // Find exactly the products that were recently affected
        const res = await client.query(`
            SELECT DISTINCT
                p.ProductID, 
                p.ProductName, 
                p.Size,
                p.QteParColis,
                p.QteColisParPalette,
                u.UnitCode as PrimaryUnit,
                i.QuantityOnHand,
                i.WarehouseID
            FROM Products p
            JOIN Units u ON p.PrimaryUnitID = u.UnitID
            JOIN Inventory i ON p.ProductID = i.ProductID AND i.OwnershipType = 'OWNED' AND i.WarehouseID = 1
            JOIN InventoryTransactions it ON p.ProductID = it.ProductID
            WHERE (p.Size IS NOT NULL OR p.ProductName ~ '\\d+\\s*[xX*/]\\s*\\d+')
              AND u.UnitCode IN ('PCS', 'PIECE', 'PIÈCE')
              AND p.ProductName NOT ILIKE '%fiche%'
              AND it.CreatedAt >= '2026-04-06 00:00:00'
              AND it.ReferenceType IN ('ORDER', 'PURCHASE')
        `);
        
        console.log('Found ' + res.rows.length + ' affected products since April 6 to evaluate and fix.');
        
        await client.query('BEGIN');
        let fixedCount = 0;

        for (const product of res.rows) {
            const sqmPerPiece = parseDimensions(product.size || product.productname);
            if (sqmPerPiece <= 0) continue;

            const txRes = await client.query(`
                SELECT TransactionType, Quantity
                FROM InventoryTransactions 
                WHERE ProductID = $1 
                  AND WarehouseID = 1
                  AND CreatedAt >= '2026-04-06 00:00:00'
                  AND ReferenceType IN ('ORDER', 'PURCHASE')
            `, [product.productid]);

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

                // Protect against NaN or wildly incorrect values
                if (isNaN(truePieces)) {
                    console.error('NaN calculation for product ' + product.productid);
                    continue;
                }

                // Update the Inventory
                await client.query(`
                    UPDATE Inventory 
                    SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP 
                    WHERE ProductID = $2 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
                `, [truePieces, product.productid]);

                // Recalculate Packaging logic
                const ppc = parseFloat(product.qteparcolis) || 0;
                const cpp = parseFloat(product.qtecolisparpalette) || 0;
                const newColis = ppc > 0 ? parseFloat((truePieces / ppc).toFixed(4)) : 0;
                const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

                await client.query(`
                    UPDATE Inventory SET ColisCount = $1, PalletCount = $2
                    WHERE ProductID = $3 AND WarehouseID = 1 AND OwnershipType = 'OWNED'
                `, [newColis, newPallets, product.productid]);

                // Log adjusting transaction
                await client.query(`
                    INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy)
                    VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 'Automated retroactive adjustment (Reverting SQM to PCS logic)', 1)
                `, [product.productid, diff]);

                fixedCount++;
                console.log('Fixed Product ' + product.productid + ': ' + product.productname + ' -> Old: ' + currentStock.toFixed(2) + ' New: ' + truePieces.toFixed(2));
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

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

async function fixAffectedProductsSmart() {
    let client;
    try {
        client = await pool.connect();
        
        // 1. Read the affected products directly from the SQL
        const res = await client.query(`
            SELECT DISTINCT
                p.ProductID, 
                p.ProductName, 
                p.Size,
                p.QteParColis,
                p.QteColisParPalette,
                u.UnitCode as PrimaryUnit,
                i.QuantityOnHand
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
        
        console.log('Evaluating ' + res.rows.length + ' products...');
        
        await client.query('BEGIN');
        let fixedCount = 0;

        for (const product of res.rows) {
            const sqmPerPiece = parseDimensions(product.size || product.productname);
            if (sqmPerPiece <= 0) continue;

            // Find the most recent sync time for this product
            const syncRes = await client.query(`
                SELECT CreatedAt FROM InventoryTransactions
                WHERE ProductID = $1 AND ReferenceType IN ('CATALOGUE_SYNC', 'MANUAL_ADJUSTMENT')
                ORDER BY CreatedAt DESC LIMIT 1
            `, [product.productid]);
            
            let anchorTime = '2026-04-06 00:00:00';
            if (syncRes.rows.length > 0) {
                // We must use transactions strictly after the sync. 
                // Add 1 second to avoid grabbing the sync transaction itself if it's identical
                const syncDate = new Date(syncRes.rows[0].createdat);
                syncDate.setSeconds(syncDate.getSeconds() + 1);
                
                // Only use this anchor if it happened recently
                if (syncDate > new Date('2026-04-06 00:00:00')) {
                    anchorTime = syncDate.toISOString();
                }
            }

            const txRes = await client.query(`
                SELECT TransactionType, Quantity, CreatedAt
                FROM InventoryTransactions 
                WHERE ProductID = $1 
                  AND WarehouseID = 1
                  AND CreatedAt >= $2
                  AND ReferenceType IN ('ORDER', 'PURCHASE')
            `, [product.productid, anchorTime]);

            if (txRes.rows.length === 0) continue;

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
                
                let truePieces = (currentStock - netAddedSqm) + netAddedPieces;
                
                // Quick sanity check: If truePieces goes negative slightly due to floating point, cap at 0
                if (truePieces < 0 && truePieces > -0.5) truePieces = 0;
                
                const diff = truePieces - currentStock;

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
                console.log('Fixed [' + product.productid + '] ' + product.productname + ' | Anchor: ' + anchorTime + ' | Old: ' + currentStock.toFixed(2) + ' -> New: ' + truePieces.toFixed(2));
            }
        }

        await client.query('COMMIT');
        try { await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue'); } catch(e){}
        
        console.log('\\nSuccessfully fixed ' + fixedCount + ' products using anchor-smart math.');

    } catch(err) {
        if(client) await client.query('ROLLBACK');
        console.error(err);
    } finally {
        if(client) client.release();
        pool.end();
    }
}

fixAffectedProductsSmart();

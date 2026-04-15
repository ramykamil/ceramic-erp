const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

const parseDimensions = (str) => {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*/]\s*(\d{2,3})/);
    if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    }
    return 0;
};

async function fixInventory() {
    let client;
    try {
        client = await pool.connect();
        
        // 1. Fetch exactly the 338 target products using the database logic directly
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
        
        console.log("Evaluating " + res.rows.length + " products identified since April 6...");
        
        await client.query("BEGIN");
        let fixedCount = 0;
        let skippedCount = 0;
        let noSyncCount = 0;

        for (const product of res.rows) {
            const productId = product.productid;

            // 2. Find the anchor sync from April 7 (Ramy, "Sync update")
            const syncRes = await client.query("SELECT CreatedAt, Quantity FROM InventoryTransactions WHERE ProductID = $1 AND ReferenceType = 'CATALOGUE_SYNC' AND Notes ILIKE '%Sync update%' AND CreatedAt BETWEEN '2026-04-06 20:00:00' AND '2026-04-07 04:00:00' ORDER BY CreatedAt DESC LIMIT 1", [productId]);

            if (syncRes.rows.length === 0) {
                noSyncCount++;
                continue;
            }

            const syncValue = parseFloat(syncRes.rows[0].quantity);
            const syncTime = syncRes.rows[0].createdat;

            // 3. Get all ORDER/PURCHASE transactions strictly AFTER this sync
            const txRes = await client.query("SELECT TransactionType, Quantity FROM InventoryTransactions WHERE ProductID = $1 AND WarehouseID = 1 AND CreatedAt > $2 AND ReferenceType IN ('ORDER', 'PURCHASE')", [productId, syncTime]);

            if (txRes.rows.length === 0) {
                skippedCount++;
                continue;
            }

            const sqmPerPiece = parseDimensions(product.size || product.productname);
            if (sqmPerPiece <= 0) {
                continue;
            }

            let netPiecesDelta = 0;
            for (const tx of txRes.rows) {
                const txSqm = parseFloat(tx.quantity);
                const txPieces = txSqm / sqmPerPiece;

                if (tx.transactiontype === 'IN') {
                    netPiecesDelta += txPieces;
                } else if (tx.transactiontype === 'OUT') {
                    netPiecesDelta -= txPieces;
                }
            }

            const truePieces = syncValue + netPiecesDelta;
            const currentStockInDB = parseFloat(product.quantityonhand);
            const diff = truePieces - currentStockInDB;

            // If the difference is significant, apply the fix
            if (Math.abs(diff) > 0.0001) {
                // Update Inventory
                await client.query("UPDATE Inventory SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $2 AND WarehouseID = 1 AND OwnershipType = 'OWNED'", [truePieces, productId]);

                // Update Packaging Counts
                const ppc = parseFloat(product.qteparcolis) || 0;
                const cpp = parseFloat(product.qtecolisparpalette) || 0;
                const newColis = ppc > 0 ? parseFloat((truePieces / ppc).toFixed(4)) : 0;
                const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

                await client.query("UPDATE Inventory SET ColisCount = $1, PalletCount = $2 WHERE ProductID = $3 AND WarehouseID = 1 AND OwnershipType = 'OWNED'", [newColis, newPallets, productId]);

                // Insert Adjustment Log
                await client.query("INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy) VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 'Retroactive correction from April 7 Sync (SQM -> PCS fix)', 1)", [productId, diff]);

                fixedCount++;
                if (productId === 3865) {
                    console.log("Fixed MOTIF SWEET [3865] | Sync: " + syncValue + " | Delta: " + netPiecesDelta + " | Result: " + truePieces);
                }
            } else {
                skippedCount++;
            }
        }

        await client.query("COMMIT");
        try { await pool.query("REFRESH MATERIALIZED VIEW mv_Catalogue"); } catch(e){}
        
        console.log("\nSUMMARY:");
        console.log("Fixed: " + fixedCount);
        console.log("Skipped (No movement since sync): " + skippedCount);
        console.log("Skipped (No April 7 sync found): " + noSyncCount);

    } catch (err) {
        if (client) await client.query("ROLLBACK");
        console.error(err);
    } finally {
        if (client) client.release();
        pool.end();
    }
}
fixInventory();

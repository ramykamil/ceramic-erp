const pool = require('../config/database');

async function fixProductQcCp() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Scanning products to fix Q/C (QteParColis) and C/P (QteColisParPalette)...');

        // Fetch all products
        const res = await client.query('SELECT ProductID, ProductName, ProductCode, Size, QteParColis, QteColisParPalette FROM Products');
        
        const standardRules = [
            { pattern: /20\s*[xX*]\s*20/, size: '20x20', qc: 1.00, cp: 72 },
            { pattern: /30\s*[xX*]\s*30/, size: '30x30', qc: 0.99, cp: 60 },
            { pattern: /40\s*[xX*]\s*40/, size: '40x40', qc: 0.96, cp: 48 },
            { pattern: /60\s*[xX*]\s*60/, size: '60x60', qc: 1.44, cp: 36 },
            { pattern: /80\s*[xX*]\s*80/, size: '80x80', qc: 1.28, cp: 32 },
            { pattern: /60\s*[xX*]\s*120/, size: '60x120', qc: 1.44, cp: 30 },
            { pattern: /30\s*[xX*]\s*60/, size: '30x60', qc: 1.44, cp: 40 }
        ];

        let updatedCount = 0;

        for (const p of res.rows) {
            let matched = false;
            let targetSize = p.size;
            let targetQc = parseFloat(p.qteparcolis);
            let targetCp = parseInt(p.qtecolisparpalette);

            // Try to match standard sizes from name
            for (const rule of standardRules) {
                if (rule.pattern.test(p.productname) || rule.pattern.test(p.productcode)) {
                    targetSize = rule.size;
                    // Only overwrite if currently 0 or null
                    if (!targetQc || targetQc === 0) targetQc = rule.qc;
                    if (!targetCp || targetCp === 0) targetCp = rule.cp;
                    matched = true;
                    break;
                }
            }

            // If it's a piece-based or sanitary item with no dimensions (like Basin, Sink, border, etc.)
            if (!matched && (!targetQc || targetQc === 0)) {
                // If it is a piece-sold item, set Q/C = 1, C/P = 1 as fallback so carton calculations don't show 0
                targetQc = 1.0;
                targetCp = 1;
                matched = true;
            }

            if (matched) {
                console.log(`Updating product ${p.productcode} (${p.productname}): Size=${targetSize}, Q/C=${targetQc}, C/P=${targetCp}`);
                await client.query(`
                    UPDATE Products
                    SET Size = $1, QteParColis = $2, QteColisParPalette = $3, UpdatedAt = CURRENT_TIMESTAMP
                    WHERE ProductID = $4
                `, [targetSize || p.size, targetQc, targetCp, p.productid]);

                // Also update the inventory packaging counts (PalletCount, ColisCount) based on current QuantityOnHand
                const invRes = await client.query('SELECT InventoryID, QuantityOnHand FROM Inventory WHERE ProductID = $1', [p.productid]);
                for (const inv of invRes.rows) {
                    const qty = parseFloat(inv.quantityonhand) || 0;
                    const newColis = targetQc > 0 ? parseFloat((qty / targetQc).toFixed(4)) : 0;
                    const newPallets = targetCp > 0 ? parseFloat((newColis / targetCp).toFixed(4)) : 0;
                    await client.query(`
                        UPDATE Inventory
                        SET ColisCount = $1, PalletCount = $2
                        WHERE InventoryID = $3
                    `, [newColis, newPallets, inv.inventoryid]);
                }
                updatedCount++;
            }
        }

        await client.query('COMMIT');
        console.log(`Successfully updated Q/C and C/P for ${updatedCount} products.`);

        // Refresh materialized view
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('Materialized view refreshed.');
        } catch (refreshErr) {
            console.warn('Failed to refresh mv_Catalogue:', refreshErr);
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error fixing product Q/C C/P:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

fixProductQcCp();

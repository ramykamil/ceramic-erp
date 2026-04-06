const pool = require('../../../config/database');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Directory for temp sync session data
const SYNC_TEMP_DIR = path.resolve(__dirname, '../../../../uploads/sync_sessions');

// Ensure temp directory exists
if (!fs.existsSync(SYNC_TEMP_DIR)) {
    fs.mkdirSync(SYNC_TEMP_DIR, { recursive: true });
}

/**
 * Normalize a product name for comparison
 * Trims, lowercases, collapses whitespace
 */
function normalize(name) {
    if (!name) return '';
    return name.toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Clean number from Excel cell — handles various formats
 */
function cleanNumber(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return Math.max(0, val);
    let s = val.toString();
    s = s.replace(/DA/gi, '').replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/,/g, '');
    } else if (s.includes(',') && !s.includes('.')) {
        s = s.replace(/,/g, '.');
    }
    s = s.replace(/[^0-9.\-]/g, '');
    const result = parseFloat(s) || 0;
    return Math.max(0, result);
}

/**
 * PHASE 1: Analyze the Excel file against the database
 * No DB modifications — just comparison and classification
 */
async function analyzeCatalogueSync(req, res, next) {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Fichier Excel requis (.xls ou .xlsx)' });
    }

    try {
        // 1. Parse the Excel file
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length < 2) {
            return res.status(400).json({ success: false, message: 'Le fichier est vide ou ne contient pas de données.' });
        }

        // 2. Detect column headers
        const headers = rows[0].map(h => (h || '').toString().trim());
        const findCol = (partial) => headers.findIndex(h => h.toLowerCase().includes(partial.toLowerCase()));

        const colLibelle = findCol('Libellé') !== -1 ? findCol('Libellé') : findCol('Libell');
        const colFamille = findCol('Famille');
        const colPrixVente = findCol('Prix de vente');
        const colPrixAchat = findCol("Prix d'achat") !== -1 ? findCol("Prix d'achat") : findCol('Prix d\'achat');
        const colQte = (() => {
            // Find Qté column but NOT QteParColis or QteColisParPalette
            return headers.findIndex(h => {
                const lower = h.toLowerCase().trim();
                return (lower === 'qté' || lower === 'qte') && !lower.includes('par') && !lower.includes('colis');
            });
        })();
        const colQteParColis = findCol('QteParColis');
        const colQteColisParPalette = findCol('QteColisParPalette');
        const colNbPalette = findCol('NB PALETTE');
        const colNbColis = findCol('NB COLIS');
        const colCalibre = findCol('Calibre');
        const colChoix = findCol('Choix');

        if (colLibelle === -1) {
            return res.status(400).json({
                success: false,
                message: 'Colonne "Libellé" introuvable dans le fichier. Colonnes détectées: ' + headers.join(', ')
            });
        }

        console.log('[CatalogueSync] Column mapping:', {
            colLibelle, colFamille, colPrixVente, colPrixAchat, colQte,
            colQteParColis, colQteColisParPalette, colNbPalette, colNbColis
        });

        // 3. Parse all Excel rows into structured data
        const excelProducts = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[colLibelle]) continue;

            const productName = row[colLibelle].toString().trim();
            if (!productName) continue;

            excelProducts.push({
                rowIndex: i + 1,
                productName: productName,
                brandName: colFamille !== -1 ? (row[colFamille] || '').toString().trim() : '',
                basePrice: colPrixVente !== -1 ? cleanNumber(row[colPrixVente]) : 0,
                purchasePrice: colPrixAchat !== -1 ? cleanNumber(row[colPrixAchat]) : 0,
                quantity: colQte !== -1 ? cleanNumber(row[colQte]) : 0,
                qteParColis: colQteParColis !== -1 ? cleanNumber(row[colQteParColis]) : 0,
                qteColisParPalette: colQteColisParPalette !== -1 ? cleanNumber(row[colQteColisParPalette]) : 0,
                nbPalette: colNbPalette !== -1 ? cleanNumber(row[colNbPalette]) : 0,
                nbColis: colNbColis !== -1 ? cleanNumber(row[colNbColis]) : 0,
                calibre: colCalibre !== -1 && row[colCalibre] ? row[colCalibre].toString().trim() : null,
                choix: colChoix !== -1 && row[colChoix] ? row[colChoix].toString().trim() : null,
            });
        }

        console.log(`[CatalogueSync] Parsed ${excelProducts.length} products from Excel`);

        // 4. Fetch ALL active products from DB with their inventory
        const dbProductsRes = await pool.query(`
            SELECT 
                p.ProductID, p.ProductCode, p.ProductName, p.BrandID, 
                b.BrandName, p.BasePrice, p.PurchasePrice, 
                p.QteParColis, p.QteColisParPalette, p.Calibre, p.Choix,
                COALESCE(SUM(i.QuantityOnHand), 0) as currentQty,
                COALESCE(SUM(i.PalletCount), 0) as currentPallets,
                COALESCE(SUM(i.ColisCount), 0) as currentColis
            FROM Products p
            LEFT JOIN Brands b ON p.BrandID = b.BrandID
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            WHERE p.IsActive = TRUE
            GROUP BY p.ProductID, p.ProductCode, p.ProductName, p.BrandID, 
                     b.BrandName, p.BasePrice, p.PurchasePrice,
                     p.QteParColis, p.QteColisParPalette, p.Calibre, p.Choix
        `);
        const dbProducts = dbProductsRes.rows;

        // 5. Check for pending orders on products that might be removed
        const pendingOrdersRes = await pool.query(`
            SELECT DISTINCT oi.ProductID, p.ProductName, COUNT(*) as orderCount
            FROM OrderItems oi
            JOIN Orders o ON oi.OrderID = o.OrderID
            JOIN Products p ON oi.ProductID = p.ProductID
            WHERE o.Status IN ('PENDING', 'CONFIRMED', 'PROCESSING')
            AND p.IsActive = TRUE
            GROUP BY oi.ProductID, p.ProductName
        `);
        const productsWithPendingOrders = {};
        for (const row of pendingOrdersRes.rows) {
            productsWithPendingOrders[row.productid] = row.ordercount;
        }

        // 6. Build normalized lookup maps
        const dbByNormalizedName = {};
        for (const dbProd of dbProducts) {
            const key = normalize(dbProd.productname);
            dbByNormalizedName[key] = dbProd;
        }

        const excelByNormalizedName = new Set();
        for (const exProd of excelProducts) {
            excelByNormalizedName.add(normalize(exProd.productName));
        }

        // 7. Classify: NEW, UPDATED, REMOVED
        const newProducts = [];
        const updatedProducts = [];
        const removedProducts = [];

        // Check Excel products against DB
        for (const exProd of excelProducts) {
            const key = normalize(exProd.productName);
            const dbMatch = dbByNormalizedName[key];

            if (!dbMatch) {
                // NEW: in Excel but not in DB
                newProducts.push({
                    ...exProd,
                    status: 'NEW'
                });
            } else {
                // UPDATED: exists in both — check for differences
                const currentQty = parseFloat(dbMatch.currentqty) || 0;
                const currentBasePrice = parseFloat(dbMatch.baseprice) || 0;
                const currentPurchasePrice = parseFloat(dbMatch.purchaseprice) || 0;
                const currentQteParColis = parseFloat(dbMatch.qteparcolis) || 0;
                const currentQteColisParPalette = parseFloat(dbMatch.qtecolisparpalette) || 0;

                const qtyChanged = Math.abs(exProd.quantity - currentQty) > 0.01;
                const basePriceChanged = exProd.basePrice > 0 && Math.abs(exProd.basePrice - currentBasePrice) > 0.01;
                const purchasePriceChanged = exProd.purchasePrice > 0 && Math.abs(exProd.purchasePrice - currentPurchasePrice) > 0.01;
                const qteParColisChanged = exProd.qteParColis > 0 && Math.abs(exProd.qteParColis - currentQteParColis) > 0.001;
                const qteColisParPaletteChanged = exProd.qteColisParPalette > 0 && Math.abs(exProd.qteColisParPalette - currentQteColisParPalette) > 0.001;

                const hasChanges = qtyChanged || basePriceChanged || purchasePriceChanged || qteParColisChanged || qteColisParPaletteChanged;

                updatedProducts.push({
                    ...exProd,
                    status: hasChanges ? 'CHANGED' : 'UNCHANGED',
                    productId: dbMatch.productid,
                    currentQty,
                    currentBasePrice,
                    currentPurchasePrice,
                    currentQteParColis,
                    currentQteColisParPalette,
                    currentBrand: dbMatch.brandname,
                    qtyChanged,
                    basePriceChanged,
                    purchasePriceChanged,
                    qteParColisChanged,
                    qteColisParPaletteChanged,
                    hasChanges
                });
            }
        }

        // Check DB products not in Excel — these are candidates for removal
        for (const dbProd of dbProducts) {
            const key = normalize(dbProd.productname);
            if (!excelByNormalizedName.has(key)) {
                const pendingCount = productsWithPendingOrders[dbProd.productid] || 0;
                removedProducts.push({
                    productId: dbProd.productid,
                    productName: dbProd.productname,
                    brandName: dbProd.brandname || '',
                    currentQty: parseFloat(dbProd.currentqty) || 0,
                    currentBasePrice: parseFloat(dbProd.baseprice) || 0,
                    currentPurchasePrice: parseFloat(dbProd.purchaseprice) || 0,
                    pendingOrderCount: pendingCount,
                    hasPendingOrders: pendingCount > 0,
                    status: 'REMOVED'
                });
            }
        }

        // 8. Save sync session data for Phase 2
        const syncSessionId = crypto.randomUUID();
        const sessionData = {
            syncSessionId,
            createdAt: new Date().toISOString(),
            excelFileName: req.file.originalname,
            newProducts,
            updatedProducts,
            removedProducts
        };

        const sessionFile = path.join(SYNC_TEMP_DIR, `${syncSessionId}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

        // 9. Clean up uploaded file
        try { fs.unlinkSync(req.file.path); } catch (e) { }

        // 10. Return analysis report
        const changedProducts = updatedProducts.filter(p => p.hasChanges);
        const unchangedProducts = updatedProducts.filter(p => !p.hasChanges);
        const productsWithWarnings = removedProducts.filter(p => p.hasPendingOrders);

        res.json({
            success: true,
            data: {
                syncSessionId,
                fileName: req.file.originalname,
                summary: {
                    totalExcelRows: excelProducts.length,
                    totalDbProducts: dbProducts.length,
                    newCount: newProducts.length,
                    updatedCount: changedProducts.length,
                    unchangedCount: unchangedProducts.length,
                    removedCount: removedProducts.length,
                    warningCount: productsWithWarnings.length
                },
                newProducts: newProducts.slice(0, 500), // Limit response size
                updatedProducts: changedProducts.slice(0, 500),
                unchangedProducts: unchangedProducts.length, // Just the count
                removedProducts: removedProducts.slice(0, 500),
                warnings: productsWithWarnings.map(p => ({
                    productName: p.productName,
                    pendingOrderCount: p.pendingOrderCount,
                    message: `⚠️ "${p.productName}" a ${p.pendingOrderCount} commande(s) en cours`
                }))
            }
        });

    } catch (error) {
        // Clean up uploaded file on error
        try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) { }
        console.error('[CatalogueSync] Analysis error:', error);
        next(error);
    }
}


/**
 * PHASE 2: Execute the catalogue sync
 * Applies all changes in a single transaction
 */
async function executeCatalogueSync(req, res, next) {
    const { syncSessionId, warehouseId } = req.body;
    const { userId } = req.user;

    if (!syncSessionId) {
        return res.status(400).json({ success: false, message: 'syncSessionId requis.' });
    }

    const targetWarehouseId = warehouseId || 1;

    // 1. Load session data
    const sessionFile = path.join(SYNC_TEMP_DIR, `${syncSessionId}.json`);
    if (!fs.existsSync(sessionFile)) {
        return res.status(404).json({ success: false, message: 'Session de synchronisation expirée ou introuvable. Veuillez relancer l\'analyse.' });
    }

    let sessionData;
    try {
        sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Erreur lors de la lecture de la session.' });
    }

    const { newProducts, updatedProducts, removedProducts } = sessionData;
    const results = {
        created: 0,
        updated: 0,
        removed: 0,
        skipped: 0,
        errors: []
    };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get unit IDs
        const unitsRes = await client.query("SELECT UnitID, UnitCode FROM Units");
        const unitPCS = unitsRes.rows.find(u => u.unitcode === 'PCS')?.unitid || 1;
        const unitSQM = unitsRes.rows.find(u => u.unitcode === 'SQM')?.unitid || 3;

        // ========================================
        // A. CREATE NEW PRODUCTS
        // ========================================
        for (const item of newProducts) {
            try {
                await client.query(`SAVEPOINT new_${item.rowIndex}`);

                // 1. Handle Brand
                let brandID = null;
                if (item.brandName) {
                    const bRes = await client.query("SELECT BrandID FROM Brands WHERE LOWER(TRIM(BrandName)) = $1", [item.brandName.toLowerCase().trim()]);
                    if (bRes.rows.length > 0) {
                        brandID = bRes.rows[0].brandid;
                    } else {
                        const newB = await client.query("INSERT INTO Brands (BrandName, IsActive) VALUES ($1, TRUE) RETURNING BrandID", [item.brandName.trim()]);
                        brandID = newB.rows[0].brandid;
                    }
                }

                // 2. Detect Unit (SQM for m² products, PCS otherwise)
                let targetUnitId = unitPCS;
                if (item.productName.toUpperCase().includes('(M²)') || item.productName.toUpperCase().includes('M2')) {
                    targetUnitId = unitSQM;
                }

                // 3. Create Product
                const newP = await client.query(`
                    INSERT INTO Products (ProductCode, ProductName, PrimaryUnitID, BasePrice, PurchasePrice, BrandID, 
                                         Calibre, Choix, QteParColis, QteColisParPalette, IsActive)
                    VALUES ($1, $2, $3, $4::NUMERIC, $5::NUMERIC, $6, $7, $8, $9::NUMERIC, $10::NUMERIC, TRUE)
                    RETURNING ProductID
                `, [item.productName, item.productName, targetUnitId, item.basePrice, item.purchasePrice, brandID,
                    item.calibre, item.choix, item.qteParColis, item.qteColisParPalette]);
                const pID = newP.rows[0].productid;

                // 4. Link Unit
                await client.query(`
                    INSERT INTO ProductUnits (ProductID, UnitID, ConversionFactor, IsDefault)
                    VALUES ($1, $2, 1.0, TRUE)
                    ON CONFLICT (ProductID, UnitID) DO UPDATE SET IsDefault = TRUE
                `, [pID, targetUnitId]);

                // 5. Create Inventory
                await client.query(`
                    INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount, FactoryID)
                    VALUES ($1, $2, 'OWNED', $3::NUMERIC, $4::NUMERIC, $5::NUMERIC, NULL)
                `, [pID, targetWarehouseId, item.quantity, item.nbPalette, item.nbColis]);

                // 6. Log Transaction
                if (item.quantity > 0) {
                    await client.query(`
                        INSERT INTO InventoryTransactions 
                        (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                        VALUES ($1, $2, 'ADJUSTMENT', $3, 'CATALOGUE_SYNC', 'Nouveau produit - Sync catalogue', $4, 'OWNED')
                    `, [pID, targetWarehouseId, item.quantity, userId]);
                }

                results.created++;
                await client.query(`RELEASE SAVEPOINT new_${item.rowIndex}`);
            } catch (err) {
                await client.query(`ROLLBACK TO SAVEPOINT new_${item.rowIndex}`);
                results.errors.push({ product: item.productName, error: err.message, action: 'CREATE' });
                console.error(`[CatalogueSync] Create error for "${item.productName}":`, err.message);
            }
        }

        // ========================================
        // B. UPDATE EXISTING PRODUCTS
        // ========================================
        const changedProducts = updatedProducts.filter(p => p.hasChanges);
        for (const item of changedProducts) {
            try {
                await client.query(`SAVEPOINT upd_${item.productId}`);

                // 1. Update Product fields (non-zero prices only)
                await client.query(`
                    UPDATE Products SET 
                        BasePrice = COALESCE(NULLIF($1::NUMERIC, 0), BasePrice),
                        PurchasePrice = COALESCE(NULLIF($2::NUMERIC, 0), PurchasePrice),
                        QteParColis = CASE WHEN $3::NUMERIC > 0 THEN $3::NUMERIC ELSE QteParColis END,
                        QteColisParPalette = CASE WHEN $4::NUMERIC > 0 THEN $4::NUMERIC ELSE QteColisParPalette END,
                        UpdatedAt = CURRENT_TIMESTAMP
                    WHERE ProductID = $5
                `, [item.basePrice, item.purchasePrice, item.qteParColis, item.qteColisParPalette, item.productId]);

                // 2. Update Inventory quantity (if changed)
                if (item.qtyChanged) {
                    // Find the OWNED inventory record
                    const invRes = await client.query(`
                        SELECT InventoryID, QuantityOnHand FROM Inventory 
                        WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' 
                        AND FactoryID IS NULL LIMIT 1
                    `, [item.productId, targetWarehouseId]);

                    if (invRes.rows.length > 0) {
                        const currentQty = parseFloat(invRes.rows[0].quantityonhand) || 0;
                        const diff = item.quantity - currentQty;

                        // Update QuantityOnHand directly to new value
                        await client.query(`
                            UPDATE Inventory SET 
                                QuantityOnHand = $1::NUMERIC,
                                UpdatedAt = CURRENT_TIMESTAMP
                            WHERE InventoryID = $2
                        `, [item.quantity, invRes.rows[0].inventoryid]);

                        // Recalculate packaging
                        const ppc = item.qteParColis > 0 ? item.qteParColis : (item.currentQteParColis || 0);
                        const cpp = item.qteColisParPalette > 0 ? item.qteColisParPalette : (item.currentQteColisParPalette || 0);
                        const newColis = ppc > 0 ? parseFloat((item.quantity / ppc).toFixed(4)) : item.nbColis;
                        const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : item.nbPalette;

                        await client.query(`
                            UPDATE Inventory SET ColisCount = $1, PalletCount = $2 WHERE InventoryID = $3
                        `, [newColis, newPallets, invRes.rows[0].inventoryid]);

                        // Log transaction
                        if (Math.abs(diff) > 0.001) {
                            await client.query(`
                                INSERT INTO InventoryTransactions 
                                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                                VALUES ($1, $2, 'ADJUSTMENT', $3, 'CATALOGUE_SYNC', $4, $5, 'OWNED')
                            `, [item.productId, targetWarehouseId, diff,
                                `Sync catalogue: ${currentQty.toFixed(2)} → ${item.quantity.toFixed(2)}`, userId]);
                        }
                    } else {
                        // No inventory record — create one
                        const ppc = item.qteParColis > 0 ? item.qteParColis : 0;
                        const cpp = item.qteColisParPalette > 0 ? item.qteColisParPalette : 0;
                        const newColis = ppc > 0 ? parseFloat((item.quantity / ppc).toFixed(4)) : item.nbColis;
                        const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : item.nbPalette;

                        await client.query(`
                            INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount, FactoryID)
                            VALUES ($1, $2, 'OWNED', $3::NUMERIC, $4::NUMERIC, $5::NUMERIC, NULL)
                        `, [item.productId, targetWarehouseId, item.quantity, newPallets, newColis]);

                        if (item.quantity > 0) {
                            await client.query(`
                                INSERT INTO InventoryTransactions 
                                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                                VALUES ($1, $2, 'ADJUSTMENT', $3, 'CATALOGUE_SYNC', 'Init stock via sync catalogue', $4, 'OWNED')
                            `, [item.productId, targetWarehouseId, item.quantity, userId]);
                        }
                    }
                }

                results.updated++;
                await client.query(`RELEASE SAVEPOINT upd_${item.productId}`);
            } catch (err) {
                await client.query(`ROLLBACK TO SAVEPOINT upd_${item.productId}`);
                results.errors.push({ product: item.productName, error: err.message, action: 'UPDATE' });
                console.error(`[CatalogueSync] Update error for "${item.productName}":`, err.message);
            }
        }

        // ========================================
        // C. SOFT-DELETE REMOVED PRODUCTS
        // ========================================
        for (const item of removedProducts) {
            try {
                await client.query(`SAVEPOINT rem_${item.productId}`);

                // Soft-delete the product
                await client.query(`
                    UPDATE Products SET IsActive = FALSE, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $1
                `, [item.productId]);

                // Zero out inventory
                const invRecords = await client.query(
                    'SELECT InventoryID, QuantityOnHand FROM Inventory WHERE ProductID = $1',
                    [item.productId]
                );

                for (const inv of invRecords.rows) {
                    const currentQty = parseFloat(inv.quantityonhand) || 0;
                    if (currentQty > 0) {
                        await client.query(`
                            UPDATE Inventory SET QuantityOnHand = 0, PalletCount = 0, ColisCount = 0, UpdatedAt = CURRENT_TIMESTAMP
                            WHERE InventoryID = $1
                        `, [inv.inventoryid]);

                        await client.query(`
                            INSERT INTO InventoryTransactions 
                            (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                            VALUES ($1, $2, 'ADJUSTMENT', $3, 'CATALOGUE_SYNC', 'Produit supprimé - Sync catalogue', $4, 'OWNED')
                        `, [item.productId, targetWarehouseId, -currentQty, userId]);
                    }
                }

                results.removed++;
                await client.query(`RELEASE SAVEPOINT rem_${item.productId}`);
            } catch (err) {
                await client.query(`ROLLBACK TO SAVEPOINT rem_${item.productId}`);
                results.errors.push({ product: item.productName, error: err.message, action: 'REMOVE' });
                console.error(`[CatalogueSync] Remove error for "${item.productName}":`, err.message);
            }
        }

        // ========================================
        // D. COMMIT & CLEANUP
        // ========================================
        await client.query('COMMIT');

        // Refresh materialized view
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('[CatalogueSync] Refreshed mv_Catalogue');
        } catch (e) {
            console.warn('[CatalogueSync] Could not refresh mv_Catalogue:', e.message);
        }

        // Clean up session file
        try { fs.unlinkSync(sessionFile); } catch (e) { }

        console.log(`[CatalogueSync] Complete — Created: ${results.created}, Updated: ${results.updated}, Removed: ${results.removed}, Errors: ${results.errors.length}`);

        res.json({
            success: true,
            message: `Synchronisation terminée avec succès.`,
            data: {
                created: results.created,
                updated: results.updated,
                removed: results.removed,
                skipped: results.skipped,
                errors: results.errors.slice(0, 50)
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[CatalogueSync] Execution error:', error);
        next(error);
    } finally {
        client.release();
    }
}

module.exports = {
    analyzeCatalogueSync,
    executeCatalogueSync
};

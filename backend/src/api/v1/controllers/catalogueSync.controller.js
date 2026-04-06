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
    const sessionFile = path.join(SYNC_TEMP_DIR, `${syncSessionId}.json`);
    
    if (!fs.existsSync(sessionFile)) {
        return res.status(404).json({ success: false, message: 'Session expirée.' });
    }

    let sessionData;
    try {
        sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Erreur session.' });
    }

    const { newProducts, updatedProducts, removedProducts } = sessionData;
    const results = { created: 0, updated: 0, removed: 0, skipped: 0, errors: [] };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. BATCH BRANDS
        const brandNames = [...new Set([
            ...newProducts.map(p => p.brandName),
            ...updatedProducts.map(p => p.brandName)
        ].filter(Boolean).map(b => b.trim()))];

        const brandMap = new Map();
        if (brandNames.length > 0) {
            const existing = await client.query(
                "SELECT BrandID, BrandName FROM Brands WHERE LOWER(TRIM(BrandName)) = ANY($1)",
                [brandNames.map(b => b.toLowerCase())]
            );
            existing.rows.forEach(b => brandMap.set(b.brandname.toLowerCase().trim(), b.brandid));

            for (const name of brandNames) {
                const key = name.toLowerCase();
                if (!brandMap.has(key)) {
                    const ins = await client.query("INSERT INTO Brands (BrandName, IsActive) VALUES ($1, TRUE) RETURNING BrandID", [name.trim()]);
                    brandMap.set(key, ins.rows[0].brandid);
                }
            }
        }

        // Get Units
        const unitsRes = await client.query("SELECT UnitID, UnitCode FROM Units");
        const unitPCS = unitsRes.rows.find(u => u.unitcode === 'PCS')?.unitid || 1;
        const unitSQM = unitsRes.rows.find(u => u.unitcode === 'SQM')?.unitid || 3;

        // 2. BATCH CREATE NEW PRODUCTS (Chunks of 50)
        const CREATE_BATCH_SIZE = 50;
        for (let i = 0; i < newProducts.length; i += CREATE_BATCH_SIZE) {
            const chunk = newProducts.slice(i, i + CREATE_BATCH_SIZE);
            for (const p of chunk) {
                try {
                    await client.query('SAVEPOINT product_creation');
                    const bID = p.brandName ? brandMap.get(p.brandName.toLowerCase().trim()) : null;
                    const uID = (p.productName.toUpperCase().match(/\(M²\)|M2/)) ? unitSQM : unitPCS;
                    
                    const resP = await client.query(`
                        INSERT INTO Products (ProductCode, ProductName, PrimaryUnitID, BasePrice, PurchasePrice, BrandID, Calibre, Choix, QteParColis, QteColisParPalette, IsActive)
                        VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) RETURNING ProductID
                    `, [p.productName, uID, p.basePrice || 0, p.purchasePrice || 0, bID, p.calibre, p.choix, p.qteParColis || 0, p.qteColisParPalette || 0]);
                    
                    const pid = resP.rows[0].productid;
                    await client.query("INSERT INTO ProductUnits (ProductID, UnitID, ConversionFactor, IsDefault) VALUES ($1, $2, 1.0, TRUE)", [pid, uID]);
                    await client.query("INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount) VALUES ($1, $2, 'OWNED', $3, $4, $5)", 
                        [pid, targetWarehouseId, p.quantity || 0, p.nbPalette || 0, p.nbColis || 0]);
                    
                    if ((p.quantity || 0) > 0) {
                        await client.query(`INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                            VALUES ($1, $2, 'ADJUSTMENT', $3, 'CATALOGUE_SYNC', 'Initial sync', $4, 'OWNED')`, [pid, targetWarehouseId, p.quantity, userId]);
                    }
                    await client.query('RELEASE SAVEPOINT product_creation');
                    results.created++;
                } catch (e) { 
                    await client.query('ROLLBACK TO SAVEPOINT product_creation');
                    results.errors.push({ name: p.productName, error: e.message }); 
                }
            }
        }

        // 3. BATCH UPDATE PRODUCTS (Using UNNEST for high performance)
        const toUpdate = updatedProducts.filter(p => p.hasChanges);
        if (toUpdate.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
                const chunk = toUpdate.slice(i, i + BATCH_SIZE);
                
                // Update Product basic info
                await client.query(`
                    UPDATE Products AS p SET
                        BasePrice = CASE WHEN u.base_price > 0 THEN u.base_price ELSE p.BasePrice END,
                        PurchasePrice = CASE WHEN u.purchase_price > 0 THEN u.purchase_price ELSE p.PurchasePrice END,
                        QteParColis = CASE WHEN u.qpc > 0 THEN u.qpc ELSE p.QteParColis END,
                        QteColisParPalette = CASE WHEN u.cpp > 0 THEN u.cpp ELSE p.QteColisParPalette END,
                        UpdatedAt = CURRENT_TIMESTAMP
                    FROM (
                        SELECT * FROM UNNEST($1::int[], $2::numeric[], $3::numeric[], $4::numeric[], $5::numeric[])
                        AS t(id, base_price, purchase_price, qpc, cpp)
                    ) AS u
                    WHERE p.ProductID = u.id
                `, [
                    chunk.map(p => p.productId),
                    chunk.map(p => p.basePrice || 0),
                    chunk.map(p => p.purchasePrice || 0),
                    chunk.map(p => p.qteParColis || 0),
                    chunk.map(p => p.qteColisParPalette || 0)
                ]);

                // Update Inventory and Transactions for qty changes
                const qtyChanges = chunk.filter(p => p.qtyChanged);
                for (const p of qtyChanges) {
                    const inv = await client.query("SELECT InventoryID, QuantityOnHand FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' LIMIT 1", [p.productId, targetWarehouseId]);
                    if (inv.rows.length > 0) {
                        const diff = (p.quantity || 0) - parseFloat(inv.rows[0].quantityonhand);
                        await client.query("UPDATE Inventory SET QuantityOnHand = $1, ColisCount = $2, PalletCount = $3, UpdatedAt = CURRENT_TIMESTAMP WHERE InventoryID = $4", 
                            [p.quantity || 0, p.nbColis || 0, p.nbPalette || 0, inv.rows[0].inventoryid]);
                        if (Math.abs(diff) > 0.001) {
                            await client.query("INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType) VALUES ($1, $2, 'ADJUSTMENT', $3, 'CATALOGUE_SYNC', 'Sync update', $4, 'OWNED')", 
                                [p.productId, targetWarehouseId, diff, userId]);
                        }
                    }
                }
                results.updated += chunk.length;
            }
        }

        // 4. BATCH REMOVE
        if (removedProducts.length > 0) {
            const ids = removedProducts.map(p => p.productId);
            await client.query("UPDATE Products SET IsActive = FALSE, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = ANY($1)", [ids]);
            await client.query("UPDATE Inventory SET QuantityOnHand = 0, ColisCount = 0, PalletCount = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = ANY($1)", [ids]);
            results.removed = removedProducts.length;
        }

        await client.query('COMMIT');
        try { await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue'); } catch (e) {}
        if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);

        res.json({ success: true, message: 'Synchronisation réussie', data: results });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sync Execute Error:', error);
        next(error);
    } finally {
        client.release();
    }
}

module.exports = {
    analyzeCatalogueSync,
    executeCatalogueSync
};

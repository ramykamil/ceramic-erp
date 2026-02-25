const pool = require('../../../config/database');
const csv = require('csv-parser');
const fs = require('fs');

// ... (getInventoryLevels, getInventoryTransactions, adjustStock remain exactly the same) ...
async function getInventoryLevels(req, res, next) {
    try {
        const { productId, warehouseId, search, warehouseType, brandFilter, stockLevel, sortBy, sortDir } = req.query;
        // console.log('GET /inventory/levels query:', req.query);

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // Build WHERE conditions
        let whereConditions = ['1=1'];
        const params = [];
        let paramIndex = 1;

        if (productId) {
            whereConditions.push(`ProductID = $${paramIndex++}`);
            params.push(productId);
        }

        if (warehouseId) {
            whereConditions.push(`WarehouseID = $${paramIndex++}`);
            params.push(warehouseId);
        }

        // Handle search
        if (search && typeof search === 'string' && search.trim() !== '') {
            const searchTerm = `%${search.trim()}%`;
            whereConditions.push(`(ProductCode ILIKE $${paramIndex} OR ProductName ILIKE $${paramIndex} OR BrandName ILIKE $${paramIndex})`);
            params.push(searchTerm);
            paramIndex++;
        }

        // Brand filter (server-side)
        if (brandFilter && typeof brandFilter === 'string' && brandFilter.trim() !== '') {
            whereConditions.push(`BrandName = $${paramIndex++}`);
            params.push(brandFilter.trim());
        }

        // Stock level filter (server-side)
        if (stockLevel === 'low') {
            whereConditions.push(`QuantityOnHand > 0 AND QuantityOnHand <= 100`);
        } else if (stockLevel === 'out') {
            whereConditions.push(`QuantityOnHand <= 0`);
        }

        const whereClause = whereConditions.join(' AND ');

        // Determine sorting - default is ProductName
        const allowedSortColumns = ['productname', 'brandname', 'quantityonhand', 'quantityavailable', 'quantityreserved', 'palletcount', 'coliscount', 'warehousename'];
        let orderBy = 'ProductName, WarehouseName';
        if (sortBy && allowedSortColumns.includes(sortBy.toLowerCase())) {
            const direction = sortDir && sortDir.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
            orderBy = `${sortBy} ${direction} NULLS LAST, ProductName`;
        }

        // Count query for total
        const countQuery = `SELECT COUNT(*) as total FROM vw_CurrentInventory WHERE ${whereClause}`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total) || 0;

        // Main data query
        let dataQuery = `
            SELECT 
                InventoryID, ProductID, WarehouseID, 
                ProductCode, ProductName, BrandName, 
                WarehouseName, OwnershipType, FactoryName, 
                QuantityOnHand, QuantityReserved, QuantityAvailable, 
                ReorderLevel, PalletCount, ColisCount 
            FROM vw_CurrentInventory 
            WHERE ${whereClause}
            ORDER BY ${orderBy}
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        params.push(limit, offset);

        const result = await pool.query(dataQuery, params);
        res.json({
            success: true,
            data: result.rows,
            total: total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(total / limit)
        });

    } catch (error) {
        console.error('Error in getInventoryLevels:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du chargement de l\'inventaire: ' + error.message
        });
    }
}

async function getInventoryTransactions(req, res, next) {
    try {
        const { productId, warehouseId, transactionType, dateFrom, dateTo, search, createdBy } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                it.TransactionID, it.CreatedAt, 
                p.ProductCode, p.ProductName, 
                p.QteParColis, p.QteColisParPalette,
                w.WarehouseName, it.TransactionType, 
                it.Quantity, it.ReferenceType, it.ReferenceID, 
                it.OwnershipType, f.FactoryName, 
                u.Username as CreatedByUser, it.CreatedBy as createdbyid 
            FROM InventoryTransactions it 
            JOIN Products p ON it.ProductID = p.ProductID 
            JOIN Warehouses w ON it.WarehouseID = w.WarehouseID 
            LEFT JOIN Factories f ON it.FactoryID = f.FactoryID 
            LEFT JOIN Users u ON it.CreatedBy = u.UserID 
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (productId) { query += ` AND it.ProductID = $${paramIndex++}`; params.push(productId); }
        if (warehouseId) { query += ` AND it.WarehouseID = $${paramIndex++}`; params.push(warehouseId); }
        if (transactionType) { query += ` AND it.TransactionType = $${paramIndex++}`; params.push(transactionType); }
        if (dateFrom) { query += ` AND it.CreatedAt >= $${paramIndex++}`; params.push(dateFrom); }
        if (dateTo) { query += ` AND it.CreatedAt <= $${paramIndex++}`; params.push(dateTo); }

        if (search && typeof search === 'string' && search.trim() !== '') {
            const searchTerm = `%${search.trim()}%`;
            query += ` AND (p.ProductCode ILIKE $${paramIndex} OR p.ProductName ILIKE $${paramIndex})`;
            params.push(searchTerm);
            paramIndex++;
        }

        if (createdBy) { query += ` AND it.CreatedBy = $${paramIndex++}`; params.push(createdBy); }

        query += ` ORDER BY it.CreatedAt DESC, it.TransactionID DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error in getInventoryTransactions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du chargement des transactions: ' + error.message
        });
    }
}

async function adjustStock(req, res, next) {
    const { productId, warehouseId, quantity, ownershipType, factoryId, notes } = req.body;
    const userId = req.user.userId;
    if (!productId || !warehouseId || quantity == null || !ownershipType) return res.status(400).json({ success: false, message: 'Champs requis manquants.' });
    const numericQuantity = parseFloat(quantity);
    if (isNaN(numericQuantity)) return res.status(400).json({ success: false, message: 'Quantité invalide.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const currentInventory = await client.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = $3 AND ($3 <> \'CONSIGNMENT\' OR FactoryID = $4)', [productId, warehouseId, ownershipType, ownershipType === 'CONSIGNMENT' ? factoryId : null]);

        const currentQty = currentInventory.rows.length > 0 ? parseFloat(currentInventory.rows[0].quantityonhand) : 0;
        const newQtyAfterAdjustment = currentQty + numericQuantity;

        if (newQtyAfterAdjustment < 0) {
            throw new Error(`Ajustement impossible: Le stock ne peut pas être négatif. Actuel: ${currentQty}, Ajustement: ${numericQuantity}, Résultat: ${newQtyAfterAdjustment}`);
        }

        const updateInventoryQuery = `UPDATE Inventory SET QuantityOnHand = QuantityOnHand + $1, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $2 AND WarehouseID = $3 AND OwnershipType = $4 AND ($4 <> 'CONSIGNMENT' OR FactoryID = $5) RETURNING QuantityOnHand;`;
        const updateParams = [numericQuantity, productId, warehouseId, ownershipType, ownershipType === 'CONSIGNMENT' ? factoryId : null];
        const updateResult = await client.query(updateInventoryQuery, updateParams);
        if (updateResult.rows.length === 0) throw new Error(`Stock introuvable. Veuillez l'initialiser.`);

        // Recalculate PalletCount and ColisCount from new quantity and product packaging
        const newQty = parseFloat(updateResult.rows[0].quantityonhand) || 0;
        const productPkg = await client.query('SELECT QteparColis, QteColisparPalette FROM Products WHERE ProductID = $1', [productId]);
        if (productPkg.rows.length > 0) {
            const ppc = parseFloat(productPkg.rows[0].qteparcolis) || 0;
            const cpp = parseFloat(productPkg.rows[0].qtecolisparpalette) || 0;
            // Use 4 decimals for high precision
            const newColis = ppc > 0 ? parseFloat((newQty / ppc).toFixed(4)) : 0;
            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;
            await client.query(
                'UPDATE Inventory SET ColisCount = $1, PalletCount = $2 WHERE ProductID = $3 AND WarehouseID = $4 AND OwnershipType = $5 AND ($5 <> \'CONSIGNMENT\' OR FactoryID = $6)',
                [newColis, newPallets, productId, warehouseId, ownershipType, ownershipType === 'CONSIGNMENT' ? factoryId : null]
            );
        }
        const insertTransactionQuery = `INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType, FactoryID) VALUES ($1, $2, 'ADJUSTMENT', $3, 'MANUAL_ADJUSTMENT', $4, $5, $6, $7);`;
        await client.query(insertTransactionQuery, [productId, warehouseId, numericQuantity, notes, userId, ownershipType, ownershipType === 'CONSIGNMENT' ? factoryId : null]);
        await client.query('COMMIT');

        // Refresh default view
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        } catch (refreshErr) {
            console.warn('Failed to refresh mv_Catalogue:', refreshErr);
        }

        res.status(201).json({ success: true, message: 'Ajustement enregistré.' });
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
}

// --- 4. Import Stock (Enhanced with Calibre/Choix) ---
async function importStock(req, res, next) {
    const targetWarehouseId = req.body.warehouseId ? parseInt(req.body.warehouseId) : null;
    if (!req.file) return res.status(400).json({ success: false, message: 'Fichier CSV requis' });
    if (!targetWarehouseId) return res.status(400).json({ success: false, message: 'Entrepôt requis' });

    const stockData = [];
    const results = { successful: 0, failed: 0, errors: [] };
    let rowCounter = 0;

    fs.createReadStream(req.file.path)
        .pipe(csv({ separator: ',', mapHeaders: ({ header }) => header.trim() }))
        .on('data', (row) => {
            rowCounter++;

            // ROBUST NUMBER CLEANER - handles "18,403.00 DA" format
            // Returns 0 for negative values (ensures no negative stock)
            const cleanNumber = (val) => {
                if (!val) return 0;
                let s = val.toString();
                s = s.replace(/DA/gi, '').replace(/\s/g, ''); // Remove 'DA' and spaces
                // Format "1,200.00" (comma thousands, dot decimal) -> Remove comma
                if (s.includes(',') && s.includes('.')) {
                    s = s.replace(/,/g, '');
                } else if (s.includes(',') && !s.includes('.')) {
                    // French format "1200,50" -> Replace comma with dot
                    s = s.replace(/,/g, '.');
                }
                s = s.replace(/[^0-9.-]/g, ''); // Remove any remaining non-numeric chars
                const result = parseFloat(s) || 0;
                // Convert negative values to 0 - no negative stock allowed
                return Math.max(0, result);
            };

            const findKey = (partial) => Object.keys(row).find(k => k.toLowerCase().includes(partial.toLowerCase()));

            // Debug: Log CSV columns on first row to see what we're working with
            if (rowCounter === 1) {
                console.log('[CSV Debug] Available columns:', Object.keys(row));
            }

            // Find NB PALETTE column - look for column with PALETTE but not containing 'Par' or 'Qte'
            const findPaletteKey = () => {
                const keys = Object.keys(row);
                // Try various spellings
                let key = keys.find(k => k.toUpperCase().replace(/\s+/g, '').includes('NBPALETTE'));
                if (key) return key;
                key = keys.find(k => k.toUpperCase().includes('NB PALETTE'));
                if (key) return key;
                key = keys.find(k => /palette/i.test(k) && !/par|qte/i.test(k));
                return key || null;
            };

            // Find NB COLIS column - look for column with COLIS but not containing 'Par' or 'Qte'
            const findColisKey = () => {
                const keys = Object.keys(row);
                // Try various spellings
                let key = keys.find(k => k.toUpperCase().replace(/\s+/g, '').includes('NBCOLIS'));
                if (key) return key;
                key = keys.find(k => k.toUpperCase().includes('NB COLIS'));
                if (key) return key;
                key = keys.find(k => /colis/i.test(k) && !/par|qte/i.test(k));
                return key || null;
            };

            const keyLibelle = findKey('Libell');
            // Specialized finder for Qté - must not match QteParColis or QteColisParPalette
            // Handles encoding issues where Qté becomes Qt or similar
            const findQtyKey = () => {
                const keys = Object.keys(row);
                // First try exact match for 'Qté' or 'Qte' (case-insensitive)
                let key = keys.find(k => k.trim().toLowerCase() === 'qté' || k.trim().toLowerCase() === 'qte');
                if (key) return key;
                // Handle encoding issues: match short column starting with Qt (2-4 chars like Qt, Qte, Qté)
                key = keys.find(k => {
                    const trimmed = k.trim();
                    const lower = trimmed.toLowerCase();
                    // Match columns that start with 'qt' and are short (not QteParColis etc)
                    return lower.startsWith('qt') && trimmed.length <= 4 && !lower.includes('par');
                });
                if (key) return key;
                // Fallback: find key containing Qté/Qte but NOT followed by Par/Colis
                key = keys.find(k => {
                    const lower = k.toLowerCase();
                    return (lower.includes('qté') || lower.includes('qte')) &&
                        !lower.includes('parcolis') &&
                        !lower.includes('colispar') &&
                        !lower.includes('par colis');
                });
                return key || null;
            };
            const keyQty = findQtyKey();
            const keySell = findKey('Prix de vente');
            const keyBuy = findKey('Prix d\'achat');
            const keyPal = findPaletteKey();
            const keyCol = findColisKey();
            const keyFamille = findKey('Famille');
            const keyRef = findKey('Reference');
            // New Fields
            const keyCalibre = findKey('Calibre');
            const keyChoix = findKey('Choix');
            // Direct extraction fields for accurate unit conversion
            const keyQteParColis = findKey('QteParColis');
            const keyQteColisParPalette = findKey('QteColisParPalette');

            if (keyLibelle && row[keyLibelle]) {
                const qty = cleanNumber(row[keyQty]);

                // Read colisCount and conversion rates first
                const colisCount = Math.abs(cleanNumber(row[keyCol]));

                // Extract conversion rates directly from CSV if available
                let piecesPerCarton = keyQteParColis ? cleanNumber(row[keyQteParColis]) : 0;
                let cartonsPerPalette = keyQteColisParPalette ? cleanNumber(row[keyQteColisParPalette]) : 0;

                // Calculate palletCount: either from CSV column or from colisCount / cartonsPerPalette
                let palletCount = Math.abs(cleanNumber(row[keyPal]));
                if (palletCount === 0 && colisCount > 0 && cartonsPerPalette > 0) {
                    // Calculate palettes from colis divided by colis-per-palette
                    palletCount = Math.floor(colisCount / cartonsPerPalette);
                }

                // Debug logging on first row
                if (rowCounter === 1) {
                    console.log('[CSV Debug] Key matches:', { keyPal, keyCol, keyQty, keyLibelle, keyFamille, keyQteColisParPalette });
                    console.log('[CSV Debug] First row values:', { palletCount, colisCount, qty, cartonsPerPalette, piecesPerCarton });
                }

                // Fallback calculation for piecesPerCarton if not in CSV
                // Use 4 decimal comparison to avoid rounding errors
                if (piecesPerCarton === 0 && colisCount > 0 && qty > 0) {
                    piecesPerCarton = Math.round((qty / colisCount) * 10000) / 10000;
                }
                // Fallback calculation for cartonsPerPalette if not in CSV and we have both counts
                if (cartonsPerPalette === 0 && palletCount > 0 && colisCount > 0) {
                    cartonsPerPalette = Math.round((colisCount / palletCount) * 10000) / 10000;
                }

                stockData.push({
                    row: rowCounter,
                    productCode: row[keyLibelle].trim(),
                    productName: row[keyLibelle].trim(),
                    brandName: (row[keyFamille] || row[keyRef] || '').trim(),
                    quantityOnHand: qty,
                    basePrice: cleanNumber(row[keySell]),
                    purchasePrice: cleanNumber(row[keyBuy]),
                    palletCount: palletCount,
                    colisCount: colisCount,
                    // New Data
                    calibre: keyCalibre && row[keyCalibre] ? row[keyCalibre].trim() : null,
                    choix: keyChoix && row[keyChoix] ? row[keyChoix].trim() : null,
                    // Extracted or fallback calculated conversion rates
                    piecesPerCarton: piecesPerCarton,
                    cartonsPerPalette: cartonsPerPalette
                });
            } else if (row.ProductCode) {
                // Fallback for standard format
                stockData.push({
                    row: rowCounter,
                    productCode: row.ProductCode,
                    warehouseCode: row.WarehouseCode,
                    quantityOnHand: cleanNumber(row.QuantityOnHand),
                    basePrice: cleanNumber(row.BasePrice),
                    purchasePrice: cleanNumber(row.PurchasePrice),
                    palletCount: cleanNumber(row.PalletCount),
                    colisCount: cleanNumber(row.ColisCount),
                    calibre: row.Calibre || null,
                    choix: row.Choix || null
                });
            }
        })
        .on('end', async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const userId = req.user.userId;
                const whID = targetWarehouseId;

                const unitsRes = await client.query("SELECT UnitID, UnitCode FROM Units");
                const unitPCS = unitsRes.rows.find(u => u.unitcode === 'PCS')?.unitid || 1;
                const unitSQM = unitsRes.rows.find(u => u.unitcode === 'SQM')?.unitid || 3;

                for (const item of stockData) {
                    try {
                        await client.query(`SAVEPOINT row_${item.row}`);

                        // 1. Handle Brand
                        let brandID = null;
                        if (item.brandName) {
                            const bRes = await client.query("SELECT BrandID FROM Brands WHERE BrandName = $1", [item.brandName]);
                            if (bRes.rows.length > 0) brandID = bRes.rows[0].brandid;
                            else {
                                const newB = await client.query("INSERT INTO Brands (BrandName, IsActive) VALUES ($1, TRUE) RETURNING BrandID", [item.brandName]);
                                brandID = newB.rows[0].brandid;
                            }
                        }

                        // 2. Detect Unit
                        let targetUnitId = unitPCS;
                        if (item.productCode.toUpperCase().includes('(M²)') || item.productCode.toUpperCase().includes('M2')) {
                            targetUnitId = unitSQM;
                        }

                        // 3. Find or Create Product
                        let pID;
                        let isNewProduct = false;
                        const pRes = await client.query("SELECT ProductID FROM Products WHERE ProductCode = $1", [item.productCode]);

                        if (pRes.rows.length > 0) {
                            pID = pRes.rows[0].productid;
                            // PROPERTIES: Update packing details and PRICES
                            // Use COALESCE(NULLIF($X::NUMERIC, 0), Column) to keep existing non-zero prices if the import has 0 or empty for prices
                            await client.query(
                                "UPDATE Products SET BasePrice = COALESCE(NULLIF($1::NUMERIC, 0), BasePrice), PurchasePrice = COALESCE(NULLIF($2::NUMERIC, 0), PurchasePrice), QteParColis = $3, QteColisParPalette = $4, UpdatedAt = CURRENT_TIMESTAMP WHERE ProductID = $5",
                                [item.basePrice, item.purchasePrice, item.piecesPerCarton, item.cartonsPerPalette, pID]
                            );
                            console.log(`[Import] Product exists, updated packing and prices: ${item.productCode}`);
                        } else {
                            isNewProduct = true;
                            // Insert new product with all attributes
                            const newP = await client.query(`
                                INSERT INTO Products (ProductCode, ProductName, PrimaryUnitID, BasePrice, PurchasePrice, BrandID, Calibre, Choix, QteParColis, QteColisParPalette, IsActive)
                                VALUES ($1, $2, $3, $4::NUMERIC, $5::NUMERIC, $6, $7, $8, $9::NUMERIC, $10::NUMERIC, TRUE)
                                RETURNING ProductID
                            `, [item.productCode, item.productName, targetUnitId, item.basePrice, item.purchasePrice, brandID, item.calibre, item.choix, item.piecesPerCarton, item.cartonsPerPalette]);
                            pID = newP.rows[0].productid;
                        }

                        // 4. Link Unit (only for new products)
                        if (isNewProduct) {
                            await client.query(`
                                INSERT INTO ProductUnits (ProductID, UnitID, ConversionFactor, IsDefault)
                                VALUES ($1, $2, 1.0, TRUE)
                                ON CONFLICT (ProductID, UnitID) DO UPDATE SET IsDefault = TRUE
                            `, [pID, targetUnitId]);
                        }

                        // 5. Update Inventory using NULL-safe check (ON CONFLICT doesn't work with NULL)
                        const invRes = await client.query(`
                            SELECT InventoryID, QuantityOnHand FROM Inventory 
                            WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' 
                            AND FactoryID IS NULL LIMIT 1
                        `, [pID, whID]);
                        let currentQty = invRes.rows.length > 0 ? parseFloat(invRes.rows[0].quantityonhand) : 0;

                        if (invRes.rows.length > 0) {
                            // UPDATE existing inventory (replace values for import)
                            await client.query(`
                                UPDATE Inventory SET 
                                    QuantityOnHand = $1::NUMERIC, 
                                    PalletCount = $2::NUMERIC, 
                                    ColisCount = $3::NUMERIC, 
                                    UpdatedAt = CURRENT_TIMESTAMP
                                WHERE InventoryID = $4
                            `, [item.quantityOnHand, item.palletCount, item.colisCount, invRes.rows[0].inventoryid]);
                        } else {
                            // INSERT new inventory record
                            await client.query(`
                                INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand, PalletCount, ColisCount, FactoryID)
                                VALUES ($1, $2, 'OWNED', $3::NUMERIC, $4::NUMERIC, $5::NUMERIC, NULL)
                            `, [pID, whID, item.quantityOnHand, item.palletCount, item.colisCount]);
                        }

                        // 6. Transaction
                        const diff = item.quantityOnHand - currentQty;
                        if (diff !== 0) {
                            await client.query(`
                                INSERT INTO InventoryTransactions 
                                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
                                VALUES ($1, $2, 'ADJUSTMENT', $3, 'IMPORT_CSV', 'Import Initial', $4, 'OWNED')
                            `, [pID, whID, diff, userId]);
                        }

                        results.successful++;
                        await client.query(`RELEASE SAVEPOINT row_${item.row}`);

                    } catch (err) {
                        await client.query(`ROLLBACK TO SAVEPOINT row_${item.row}`);
                        results.failed++;
                        results.errors.push({ row: item.row, product: item.productCode, error: err.message });
                        console.error(`[Row ${item.row} Error] ${item.productCode}: ${err.message}`);
                    }
                }

                await client.query('COMMIT');

                // REFRESH the catalogue materialized view for instant search
                try {
                    await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
                    console.log('[Import] Refreshed mv_Catalogue materialized view');
                } catch (e) {
                    console.warn('[Import] Could not refresh mv_Catalogue:', e.message);
                }

                // Clean up temp file
                try { fs.unlinkSync(req.file.path); } catch (e) { }

                // Prepare minimal response to prevent memory issues
                const successCount = results.successful;
                const failCount = results.failed;
                const firstErrors = results.errors.slice(0, 20);

                // Clear large arrays to free memory
                results.errors = null;

                console.log(`[Import Complete] Success: ${successCount}, Failed: ${failCount}`);

                // Send minimal response
                try {
                    res.json({
                        success: true,
                        message: 'Importation terminée',
                        data: {
                            successful: successCount,
                            failed: failCount,
                            errors: firstErrors
                        }
                    });
                } catch (resError) {
                    console.error('Response error:', resError);
                }

            } catch (error) {
                await client.query('ROLLBACK');
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                next(error);
            } finally { client.release(); }
        });
}


// --- 5. Export Stock ---
async function exportStock(req, res, next) {
    try {
        const query = `SELECT p.ProductCode, p.ProductName, w.WarehouseCode, w.WarehouseName, i.QuantityOnHand, i.OwnershipType, i.PalletCount, i.ColisCount FROM Inventory i JOIN Products p ON i.ProductID = p.ProductID JOIN Warehouses w ON i.WarehouseID = w.WarehouseID ORDER BY w.WarehouseCode, p.ProductCode`;
        const result = await pool.query(query);
        const csvHeader = 'ProductCode,ProductName,WarehouseCode,WarehouseName,QuantityOnHand,PalletCount,ColisCount,OwnershipType\n';
        const csvRows = result.rows.map(row => `${row.productcode},"${row.productname}",${row.warehousecode},"${row.warehousename}",${row.quantityonhand},${row.palletcount},${row.coliscount},${row.ownershiptype}`).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=stock_export.csv');
        res.send(csvHeader + csvRows);
    } catch (error) { next(error); }
}

module.exports = {
    getInventoryLevels,
    getInventoryTransactions,
    adjustStock,
    importStock,
    exportStock
};
const pool = require('../../../config/database');

/**
 * Récupère tous les Bons de Réception (Goods Receipts)
 */
async function getGoodsReceipts(req, res, next) {
    try {
        const { page = 1, limit = 50, purchaseOrderId, factoryId } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                gr.ReceiptID,
                gr.ReceiptNumber,
                gr.ReceiptDate,
                po.PONumber,
                f.FactoryName,
                w.WarehouseName,
                gr.Status,
                u.Username as ReceivedByUser
            FROM GoodsReceipts gr
            LEFT JOIN PurchaseOrders po ON gr.PurchaseOrderID = po.PurchaseOrderID
            LEFT JOIN Factories f ON gr.FactoryID = f.FactoryID
            LEFT JOIN Warehouses w ON gr.WarehouseID = w.WarehouseID
            LEFT JOIN Users u ON gr.ReceivedBy = u.UserID
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (purchaseOrderId) {
            query += ` AND gr.PurchaseOrderID = $${paramIndex++}`;
            params.push(purchaseOrderId);
        }
        if (factoryId) {
            query += ` AND gr.FactoryID = $${paramIndex++}`;
            params.push(factoryId);
        }

        query += ` ORDER BY gr.ReceiptDate DESC, gr.CreatedAt DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        // TODO: Ajouter une requête de comptage total pour la pagination

        res.json({ success: true, data: result.rows });
    } catch (error) {
        next(error);
    }
}


/**
 * Crée un nouveau Bon de Réception (Goods Receipt)
 * C'est une transaction complexe qui met à jour 5 tables :
 * 1. GoodsReceipts (Crée l'en-tête)
 * 2. GoodsReceiptItems (Crée les lignes)
 * 3. PurchaseOrderItems (Met à jour 'ReceivedQuantity')
 * 4. Inventory (Met à jour 'QuantityOnHand')
 * 5. InventoryTransactions (Enregistre le mouvement 'IN')
 */
async function createGoodsReceipt(req, res, next) {
    const {
        purchaseOrderId,
        warehouseId,
        factoryId,
        ownershipType, // 'OWNED' ou 'CONSIGNMENT'
        receiptDate,
        notes,
        items // Expected: [{ poItemId, productId, unitId, quantityReceived, palletCount, colisCount }, ...]
    } = req.body;
    const userId = req.user.userId;

    // --- Validation ---
    if (!purchaseOrderId || !warehouseId || !receiptDate || !ownershipType || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Champs requis manquants (purchaseOrderId, warehouseId, receiptDate, ownershipType, items)' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // --- Étape 1: Créer l'en-tête GoodsReceipts ---
        const grNumberResult = await client.query(
            "SELECT 'GR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('gr_seq')::TEXT, 6, '0') as gr_number"
        );
        const receiptNumber = grNumberResult.rows[0].gr_number;

        const grHeaderQuery = `
            INSERT INTO GoodsReceipts
            (ReceiptNumber, PurchaseOrderID, FactoryID, WarehouseID, ReceiptDate, OwnershipType, Notes, ReceivedBy, Status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RECEIVED')
            RETURNING ReceiptID;
        `;
        const grHeaderResult = await client.query(grHeaderQuery, [
            receiptNumber, purchaseOrderId, factoryId, warehouseId, receiptDate,
            ownershipType, notes || null, userId
        ]);
        const newReceiptID = grHeaderResult.rows[0].receiptid;

        // --- Étape 2: Boucler sur les articles réceptionnés ---
        for (const item of items) {
            const qtyReceived = parseFloat(item.quantityReceived) || 0;
            const palletCount = parseFloat(item.palletCount) || 0;
            const colisCount = parseFloat(item.colisCount) || 0;

            if (qtyReceived <= 0 && palletCount <= 0 && colisCount <= 0) {
                // Ignore les lignes sans données valides
                continue;
            }

            // 2a. Insérer dans GoodsReceiptItems
            const grItemQuery = `
                INSERT INTO GoodsReceiptItems
                (ReceiptID, POItemID, ProductID, QuantityReceived, UnitID, Notes)
                VALUES ($1, $2, $3, $4, $5, $6);
            `;
            await client.query(grItemQuery, [
                newReceiptID, item.poItemId, item.productId, qtyReceived, item.unitId, null
            ]);

            // 2b, 2c, 2d helper: Unit Conversion
            // Fetch product details to check for tile dimensions and packaging
            const productInfo = await client.query(
                `SELECT p.ProductName, p.Size, p.PrimaryUnitID, u.UnitCode, pu.UnitCode as PrimaryUnitCode,
                        p.QteParColis, p.QteColisParPalette
                 FROM Products p
                 LEFT JOIN Units u ON u.UnitId = $2
                 LEFT JOIN Units pu ON p.PrimaryUnitID = pu.UnitID
                 WHERE p.ProductID = $1`,
                [item.productId, item.unitId]
            );

            let finalQtyToAdd = qtyReceived;

            if (productInfo.rows.length > 0) {
                const pInfo = productInfo.rows[0];
                const unitCode = (pInfo.unitcode || '').toUpperCase(); // The unit we are receiving in (e.g. 'BOX')
                const primaryUnitCode = (pInfo.primaryunitcode || '').toUpperCase(); // The stock unit (e.g. 'SQM')

                // Helper to parse dimensions (e.g. "60x60") => m2
                const parseDimensions = (str) => {
                    if (!str) return 0;
                    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
                    if (match) {
                        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
                    }
                    return 0;
                };

                const sqmPerPiece = parseDimensions(pInfo.size || pInfo.productname);
                const piecesPerBox = parseFloat(pInfo.qteparcolis) || 0;
                const boxesPerPallet = parseFloat(pInfo.qtecolisparpalette) || 0;
                const isFicheProduct = (pInfo.productname || '').toLowerCase().startsWith('fiche');

                // 1. Convert everything to PIECES first
                let qtyInPieces = 0;

                if (unitCode === 'PCS' || unitCode === 'PIECE' || unitCode === 'PIÈCE') {
                    qtyInPieces = qtyReceived;
                } else if (unitCode === 'SQM' || unitCode === 'M2' || unitCode === 'M²') {
                    // If receiving in SQM, and it's a tile, convert back to pieces if needed? 
                    // Usually stock is SQM, so we might not need conversion if target is SQM.
                    // But let's standarize to pieces if we can, or just handle direct SQM.
                    if (sqmPerPiece > 0) {
                        qtyInPieces = qtyReceived / sqmPerPiece;
                    } else {
                        // Fallback for non-tile SQM items (like carpet?)
                        qtyInPieces = qtyReceived;
                    }
                } else if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode)) {
                    if (piecesPerBox > 0) {
                        qtyInPieces = qtyReceived * piecesPerBox;
                    } else {
                        // Fallback: If no pieces/box defined, we can't convert safely.
                        // Assuming 1-to-1 or user error.
                        console.warn(`[GoodsReceipt] Received in BOX but QteParColis is 0 for ${pInfo.productname}`);
                        qtyInPieces = qtyReceived; // Dangerous assumption, but better than 0
                    }
                } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode)) {
                    if (boxesPerPallet > 0 && piecesPerBox > 0) {
                        const totalBoxes = qtyReceived * boxesPerPallet;
                        qtyInPieces = totalBoxes * piecesPerBox;
                    } else {
                        console.warn(`[GoodsReceipt] Received in PALLET but packaging info missing for ${pInfo.productname}`);
                        qtyInPieces = qtyReceived; // Dangerous
                    }
                } else {
                    // Unknown unit, assume direct match
                    qtyInPieces = qtyReceived;
                }

                // 2. Convert PIECES to STOCK UNIT (PrimaryUnit)
                // If primary unit is SQM (and it's a tile), convert Pieces -> SQM
                // If primary unit is PCS, keep as Pieces

                if ((primaryUnitCode === 'SQM' || primaryUnitCode === 'M2' || primaryUnitCode === 'M²') && !isFicheProduct && sqmPerPiece > 0) {
                    finalQtyToAdd = qtyInPieces * sqmPerPiece;
                    console.log(`[GoodsReceipt] Converted ${qtyReceived} ${unitCode} -> ${qtyInPieces} PCS -> ${finalQtyToAdd} SQM`);
                } else {
                    // Start with pieces, but if the primary unit was SQM and we failed to convert (no dimensions), what then?
                    // Or if primary is BOX? (Rare).
                    // If we calculated qtyInPieces from a BOX/PALLET, and primary is PCS, we use that.
                    // If we received in PCS and primary is PCS, we use that.

                    // Special Case: If we received in SQM and Primary IS SQM, we shouldn't have converted to pieces and back if it risks rounding errors.
                    // But our logic above handled SQM -> Pieces.
                    // Let's refine:
                    if (unitCode === primaryUnitCode) {
                        finalQtyToAdd = qtyReceived; // No conversion needed if units match
                    } else if (unitCode === 'SQM' && primaryUnitCode === 'PCS') {
                        finalQtyToAdd = qtyInPieces;
                    } else {
                        // Default to the pieces count if primary is not SQM, 
                        // OR if it is SQM but we have no dimensions (e.g. paint sold by SQM coverage?) - unlikely for this ERP.
                        // Ideally:
                        finalQtyToAdd = qtyInPieces;
                    }
                }
            }

            // 2b. Mettre à jour PurchaseOrderItems (quantité réceptionnée)
            if (qtyReceived > 0) {
                const updatePoItemQuery = `
                    UPDATE PurchaseOrderItems
                    SET ReceivedQuantity = ReceivedQuantity + $1
                    WHERE POItemID = $2;
                `;
                await client.query(updatePoItemQuery, [qtyReceived, item.poItemId]);
            }

            // 2c. Mettre à jour l'Inventaire (QuantityOnHand, PalletCount, ColisCount)
            // SIMPLIFIED: All received stock is OWNED with NULL FactoryID
            // Factory/supplier is tracked via GoodsReceipt/PO header, not inventory
            const invCheck = await client.query(`
                SELECT InventoryID FROM Inventory 
                WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' 
                AND FactoryID IS NULL
                LIMIT 1
            `, [item.productId, warehouseId]);

            if (invCheck.rows.length > 0) {
                // UPDATE existing inventory
                await client.query(`
                    UPDATE Inventory SET 
                        QuantityOnHand = QuantityOnHand + $1,
                        PalletCount = COALESCE(PalletCount, 0) + $2,
                        ColisCount = COALESCE(ColisCount, 0) + $3,
                        UpdatedAt = CURRENT_TIMESTAMP
                    WHERE InventoryID = $4
                `, [finalQtyToAdd, palletCount, colisCount, invCheck.rows[0].inventoryid]);
            } else {
                // INSERT new inventory record (OWNED, no factory)
                await client.query(`
                    INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, FactoryID, QuantityOnHand, PalletCount, ColisCount)
                    VALUES ($1, $2, 'OWNED', NULL, $3, $4, $5)
                `, [item.productId, warehouseId, finalQtyToAdd, palletCount, colisCount]);
            }

            // 2d. Enregistrer la Transaction d'Inventaire
            const transQuery = `
                INSERT INTO InventoryTransactions
                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, OwnershipType, FactoryID, CreatedBy)
                VALUES ($1, $2, 'IN', $3, 'GOODS_RECEIPT', $4, 'OWNED', NULL, $5);
            `;
            await client.query(transQuery, [
                item.productId, warehouseId, finalQtyToAdd, newReceiptID, userId
            ]);
        }

        // --- Étape 3: Mettre à jour le statut du PO (Logique simplifiée) ---
        // Vérifie si toutes les quantités commandées ont été réceptionnées
        const checkPoStatusQuery = `
            SELECT 
                SUM(Quantity) as TotalOrdered,
                SUM(ReceivedQuantity) as TotalReceived
            FROM PurchaseOrderItems
            WHERE PurchaseOrderID = $1;
        `;
        const poStatusResult = await client.query(checkPoStatusQuery, [purchaseOrderId]);
        const { totalordered, totalreceived } = poStatusResult.rows[0];

        let newPoStatus = 'PARTIAL'; // Statut par défaut si réception
        if (Number(totalreceived) >= Number(totalordered)) {
            newPoStatus = 'RECEIVED'; // Complètement réceptionné
        }

        const updatePoStatusQuery = `
            UPDATE PurchaseOrders
            SET Status = $1, UpdatedAt = CURRENT_TIMESTAMP
            WHERE PurchaseOrderID = $2;
        `;
        await client.query(updatePoStatusQuery, [newPoStatus, purchaseOrderId]);


        await client.query('COMMIT');

        // Refresh materialized view to update catalogue stats (palettes, colis, stock)
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        } catch (refreshError) {
            console.warn('Note: mv_Catalogue refresh skipped:', refreshError.message);
        }

        res.status(201).json({
            success: true,
            message: 'Bon de réception enregistré avec succès. Inventaire mis à jour.',
            data: { receiptId: newReceiptID, receiptNumber: receiptNumber, newPoStatus: newPoStatus }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erreur création BR:", error);
        next(error);
    } finally {
        client.release();
    }
}

module.exports = {
    getGoodsReceipts,
    createGoodsReceipt,
    // getGoodsReceiptById, // À ajouter plus tard
};
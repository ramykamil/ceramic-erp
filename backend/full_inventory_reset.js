/**
 * FULL INVENTORY RESET — Excel Baseline + Correct GR SQM - Sales
 * 
 * For every product in the Excel file:
 *   CorrectQty = Excel_Qty + Correct_GR_SQM_since_03_03 - Sales_SQM_since_03_03
 * 
 * GR quantities are recomputed from GoodsReceiptItems (raw PCS) using
 * proper tile dimension conversion, avoiding the historical unit bug.
 * 
 * Sales quantities are taken from InventoryTransactions (OUT/ORDER)
 * which were always recorded correctly by finalizeOrder.
 */
require('dotenv').config();
const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const EXCEL_PATH = path.resolve(__dirname, '..', 'Table Produit NOUVEAUX.xls');
const CUTOFF_DATE = '2026-03-03 00:00:00';

function parseDimensions(str) {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
    if (match) return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    return 0;
}

async function main() {
    const client = await pool.connect();

    // ── STEP 1: Read Excel ──────────────────────────────────
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = XLSX.utils.sheet_to_json(sheet);

    // Build Excel lookup: ProductCode → Quantity, ProductName → Quantity
    const excelByCode = {};
    const excelByName = {};
    for (const row of excelData) {
        const code = (row['Reference'] || '').toString().trim().toUpperCase();
        const name = (row['Libellé'] || '').toString().trim().toUpperCase();
        const qty = parseFloat(row['Qté']) || 0;

        if (code) excelByCode[code] = { code, name, qty };
        if (name) excelByName[name] = { code, name, qty };
    }
    console.log(`  Excel products: ${Object.keys(excelByCode).length} by code, ${Object.keys(excelByName).length} by name`);

    // ── STEP 2: Get all active products from DB ─────────────
    const allProducts = await client.query(`
        SELECT p.ProductID, p.ProductCode, p.ProductName, p.Size, p.QteParColis, p.QteColisParPalette,
               p.PrimaryUnitID, u.UnitCode as PrimaryUnitCode
        FROM Products p
        LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
        WHERE p.IsActive = true
    `);
    console.log(`  DB active products: ${allProducts.rows.length}`);

    // Build product lookup
    const productByName = {};
    const productById = {};
    for (const p of allProducts.rows) {
        productByName[p.productname.toUpperCase()] = p;
        productById[p.productid] = p;
    }

    // ── STEP 3: Get ALL GoodsReceiptItems since cutoff ──────
    // We use GoodsReceiptItems to get the RAW quantities, then convert properly
    console.log(`\nFetching GoodsReceiptItems since ${CUTOFF_DATE}...`);
    const grItems = await client.query(`
        SELECT gri.ProductID, gri.QuantityReceived, gri.UnitID, u.UnitCode,
               gr.ReceiptDate, gr.WarehouseID
        FROM GoodsReceiptItems gri
        JOIN GoodsReceipts gr ON gri.ReceiptID = gr.ReceiptID
        LEFT JOIN Units u ON gri.UnitID = u.UnitID
        WHERE gr.ReceiptDate >= $1 OR gr.CreatedAt >= $1
    `, [CUTOFF_DATE]);
    console.log(`  GR items since cutoff: ${grItems.rows.length}`);

    // Compute correct SQM per product from GR items
    const grSqmByProduct = {};
    for (const gri of grItems.rows) {
        const prod = productById[gri.productid];
        if (!prod) continue;

        const qtyReceived = parseFloat(gri.quantityreceived) || 0;
        const unitCode = (gri.unitcode || '').toUpperCase();
        const sqmPerPiece = parseDimensions(prod.size || prod.productname);
        const isFiche = (prod.productname || '').toLowerCase().startsWith('fiche');
        const isTile = !isFiche && sqmPerPiece > 0;
        const ppc = parseFloat(prod.qteparcolis) || 0;
        const cpp = parseFloat(prod.qtecolisparpalette) || 0;

        let finalQty = qtyReceived;

        if (isTile) {
            if (['SQM', 'M2', 'M²'].includes(unitCode)) {
                finalQty = qtyReceived; // Already SQM
            } else if (['PCS', 'PIECE', 'PIÈCE'].includes(unitCode)) {
                finalQty = qtyReceived * sqmPerPiece; // PCS → SQM
            } else if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode)) {
                const pcs = ppc > 0 ? qtyReceived * ppc : qtyReceived;
                finalQty = pcs * sqmPerPiece;
            } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode)) {
                const boxes = cpp > 0 ? qtyReceived * cpp : qtyReceived;
                const pcs = ppc > 0 ? boxes * ppc : boxes;
                finalQty = pcs * sqmPerPiece;
            }
        } else {
            // Non-tile: PCS or direct
            if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode) && ppc > 0) {
                finalQty = qtyReceived * ppc;
            } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode) && cpp > 0 && ppc > 0) {
                finalQty = qtyReceived * cpp * ppc;
            }
        }

        grSqmByProduct[gri.productid] = (grSqmByProduct[gri.productid] || 0) + finalQty;
    }

    // ── STEP 4: Get ALL confirmed sales since cutoff ────────
    console.log(`Fetching confirmed sales since ${CUTOFF_DATE}...`);
    const sales = await client.query(`
        SELECT it.ProductID, SUM(it.Quantity) as TotalSold
        FROM InventoryTransactions it
        WHERE it.TransactionType = 'OUT'
          AND it.ReferenceType = 'ORDER'
          AND it.CreatedAt >= $1
        GROUP BY it.ProductID
    `, [CUTOFF_DATE]);

    const salesByProduct = {};
    for (const s of sales.rows) {
        salesByProduct[s.productid] = parseFloat(s.totalsold) || 0;
    }
    console.log(`  Products with sales: ${Object.keys(salesByProduct).length}`);

    // ── STEP 5: Compute corrections and apply ───────────────
    console.log('\n--- APPLYING INVENTORY RESET ---\n');
    await client.query('BEGIN');

    let fixedCount = 0;
    let skippedCount = 0;
    let report = '=== FULL INVENTORY RESET REPORT ===\n';
    report += `Baseline: Table Produit NOUVEAUX.xls\n`;
    report += `Cutoff Date: ${CUTOFF_DATE}\n`;
    report += `Run Date: ${new Date().toISOString()}\n\n`;

    for (const prod of allProducts.rows) {
        const code = (prod.productcode || '').trim().toUpperCase();
        const name = (prod.productname || '').trim().toUpperCase();

        // Find in Excel by code first, then by name
        let excelEntry = excelByCode[code] || excelByName[name];
        if (!excelEntry) continue; // Not in Excel

        const excelQty = excelEntry.qty;
        const grQty = grSqmByProduct[prod.productid] || 0;
        const salesQty = salesByProduct[prod.productid] || 0;
        const correctQty = Math.max(excelQty + grQty - salesQty, 0); // Floor at 0

        // Get current DB stock
        const invRes = await client.query(
            'SELECT InventoryID, QuantityOnHand FROM Inventory WHERE ProductID = $1 AND OwnershipType = \'OWNED\' LIMIT 1',
            [prod.productid]
        );

        const currentQty = invRes.rows.length > 0 ? parseFloat(invRes.rows[0].quantityonhand) : 0;
        const diff = correctQty - currentQty;

        if (Math.abs(diff) < 0.01) {
            skippedCount++;
            continue; // Already correct
        }

        fixedCount++;
        console.log(`[${prod.productcode}] ${prod.productname}`);
        console.log(`  Excel: ${excelQty.toFixed(2)} + GR: ${grQty.toFixed(2)} - Sales: ${salesQty.toFixed(2)} = ${correctQty.toFixed(2)} (was ${currentQty.toFixed(2)}, diff: ${diff > 0 ? '+' : ''}${diff.toFixed(2)})`);

        // Update inventory
        if (invRes.rows.length > 0) {
            await client.query('UPDATE Inventory SET QuantityOnHand = $1, UpdatedAt = CURRENT_TIMESTAMP WHERE InventoryID = $2',
                [correctQty, invRes.rows[0].inventoryid]);
        } else {
            await client.query('INSERT INTO Inventory (ProductID, WarehouseID, OwnershipType, QuantityOnHand) VALUES ($1, 1, \'OWNED\', $2)',
                [prod.productid, correctQty]);
        }

        // Recalculate Colis/Pallets
        const ppc = parseFloat(prod.qteparcolis) || 0;
        const cpp = parseFloat(prod.qtecolisparpalette) || 0;
        const newColis = ppc > 0 ? correctQty / ppc : 0;
        const newPallets = cpp > 0 ? newColis / cpp : 0;

        await client.query(
            'UPDATE Inventory SET ColisCount = $1, PalletCount = $2 WHERE ProductID = $3 AND OwnershipType = \'OWNED\'',
            [newColis, newPallets, prod.productid]
        );

        // Record adjustment transaction for audit trail
        await client.query(`
            INSERT INTO InventoryTransactions (
                ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy
            ) VALUES ($1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 'Full Reset: Excel baseline + GR - Sales from 03-03-2026', 1)
        `, [prod.productid, diff]);

        report += `[${prod.productcode}] ${prod.productname}\n`;
        report += `  Excel=${excelQty.toFixed(2)} + GR=${grQty.toFixed(2)} - Sales=${salesQty.toFixed(2)} = ${correctQty.toFixed(2)}\n`;
        report += `  Was: ${currentQty.toFixed(2)}, Diff: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}\n\n`;
    }

    await client.query('COMMIT');

    // Refresh view
    try {
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('\nMV Catalogue refreshed.');
    } catch (e) { /* ignore */ }

    report += `\n--- SUMMARY ---\n`;
    report += `Products fixed: ${fixedCount}\n`;
    report += `Products already correct: ${skippedCount}\n`;

    fs.writeFileSync(path.resolve(__dirname, 'full_reset_report.txt'), report);

    console.log(`\n✅ DONE. Fixed: ${fixedCount}, Already correct: ${skippedCount}`);
    console.log('Report saved to full_reset_report.txt');

    client.release();
    pool.end();
}

main().catch(err => {
    console.error('FATAL ERROR:', err);
    pool.end();
});

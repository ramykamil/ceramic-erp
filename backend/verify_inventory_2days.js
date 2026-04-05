require('dotenv').config();
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

/**
 * Inventory Verification Script
 * ==============================
 * Compares:
 *   Excel Qty (initial inventory as of ~2 days ago)
 *   + Goods Receipts (purchases received in last 2 days)
 *   - Confirmed Sales (orders confirmed in last 2 days)
 *   = Expected Current Inventory
 * 
 * Then compares Expected vs Actual DB inventory to flag discrepancies.
 * 
 * Current date: 2026-03-05
 * Cutoff: 2 days ago = 2026-03-03
 */
async function main() {
    const client = await pool.connect();
    try {
        // ============================================================
        // STEP 1: Load Excel file (initial inventory snapshot)
        // ============================================================
        console.log('='.repeat(70));
        console.log('  INVENTORY VERIFICATION: Excel vs DB (Last 2 Days Activity)');
        console.log('='.repeat(70));

        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        console.log(`\n[Excel] Loaded ${rawData.length} rows from "Table Produit NOUVEAUX.xls"\n`);

        // Build Excel map by Reference (ProductCode)
        const excelByCode = new Map();
        const excelByName = new Map();
        for (const row of rawData) {
            const code = (row['Reference'] || '').toString().trim().toUpperCase();
            const name = (row['Libellé'] || '').toString().trim().toUpperCase();
            const qty = parseFloat(row['Qté']) || 0;
            const pallets = parseFloat(row['NB PALETTE']) || 0;
            const colis = parseFloat(row['NB COLIS']) || 0;

            const entry = { code, name, qty, pallets, colis, originalRow: row };
            if (code) excelByCode.set(code, entry);
            if (name) excelByName.set(name, entry);
        }

        // ============================================================
        // STEP 2: Load current DB inventory
        // ============================================================
        console.log('[DB] Loading current inventory...');
        const dbResult = await client.query(`
            SELECT 
                p.ProductID, 
                p.ProductCode, 
                p.ProductName, 
                COALESCE(SUM(i.QuantityOnHand), 0) as CurrentQty,
                COALESCE(SUM(i.PalletCount), 0) as CurrentPallets,
                COALESCE(SUM(i.ColisCount), 0) as CurrentColis
            FROM Products p
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            WHERE p.IsActive = true
            GROUP BY p.ProductID, p.ProductCode, p.ProductName
        `);
        console.log(`[DB] Found ${dbResult.rows.length} active products.\n`);

        // Build DB map
        const dbByCode = new Map();
        const dbById = new Map();
        for (const row of dbResult.rows) {
            const code = (row.productcode || '').trim().toUpperCase();
            if (code) dbByCode.set(code, row);
            dbById.set(row.productid, row);
        }

        // ============================================================
        // STEP 3: Get CONFIRMED sales in the last 2 days
        // ============================================================
        // The cutoff is 2 days ago from now (2026-03-05), so orders confirmed on 2026-03-03 or later.
        // We look at InventoryTransactions of type 'OUT' with ReferenceType='ORDER' created >= cutoff
        console.log('[DB] Loading sales (inventory OUT) from last 2 days...');
        const salesResult = await client.query(`
            SELECT 
                it.ProductID,
                SUM(it.Quantity) as TotalSold
            FROM InventoryTransactions it
            WHERE it.TransactionType = 'OUT'
              AND it.ReferenceType = 'ORDER'
              AND it.CreatedAt >= '2026-03-03 00:00:00'::timestamp
            GROUP BY it.ProductID
        `);
        const salesByProduct = new Map();
        let totalSalesTransactions = 0;
        for (const row of salesResult.rows) {
            salesByProduct.set(row.productid, parseFloat(row.totalsold) || 0);
            totalSalesTransactions++;
        }
        console.log(`[DB] Found sales for ${totalSalesTransactions} distinct products in last 2 days.\n`);

        // Also get detailed sales info for the report
        const salesDetailResult = await client.query(`
            SELECT 
                it.ProductID,
                p.ProductCode,
                p.ProductName,
                it.Quantity,
                it.Notes,
                it.CreatedAt
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            WHERE it.TransactionType = 'OUT'
              AND it.ReferenceType = 'ORDER'
              AND it.CreatedAt >= '2026-03-03 00:00:00'::timestamp
            ORDER BY it.CreatedAt DESC
        `);

        // ============================================================
        // STEP 4: Get Goods Receipts (purchases) — properly converted
        // ============================================================
        // Uses GoodsReceiptItems to get raw quantities and converts PCS→SQM
        // for tile products, matching the corrected GR controller logic.
        console.log('[DB] Loading purchases (GoodsReceiptItems) from last 3 days...');

        const grItemsResult = await client.query(`
            SELECT gri.ProductID, gri.QuantityReceived, gri.UnitID, u.UnitCode,
                   p.ProductName, p.Size, p.QteParColis, p.QteColisParPalette
            FROM GoodsReceiptItems gri
            JOIN GoodsReceipts gr ON gri.ReceiptID = gr.ReceiptID
            LEFT JOIN Units u ON gri.UnitID = u.UnitID
            JOIN Products p ON gri.ProductID = p.ProductID
            WHERE gr.ReceiptDate >= '2026-03-03 00:00:00'::timestamp
               OR gr.CreatedAt >= '2026-03-03 00:00:00'::timestamp
        `);

        // Helper to parse tile dimensions
        const parseDimensions = (str) => {
            if (!str) return 0;
            const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
            if (match) return (parseInt(match[1], 10) * parseInt(match[2], 10)) / 10000;
            return 0;
        };

        const purchasesByProduct = new Map();
        for (const gri of grItemsResult.rows) {
            const rawQty = parseFloat(gri.quantityreceived) || 0;
            const unitCode = (gri.unitcode || '').toUpperCase();
            const sqmPerPiece = parseDimensions(gri.size || gri.productname);
            const isFiche = (gri.productname || '').toLowerCase().startsWith('fiche');
            const isTile = !isFiche && sqmPerPiece > 0;
            const ppc = parseFloat(gri.qteparcolis) || 0;
            const cpp = parseFloat(gri.qtecolisparpalette) || 0;

            let correctQty = rawQty;
            if (isTile) {
                if (['SQM', 'M2', 'M²'].includes(unitCode)) {
                    correctQty = rawQty;
                } else if (['PCS', 'PIECE', 'PIÈCE'].includes(unitCode)) {
                    correctQty = rawQty * sqmPerPiece;
                } else if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode)) {
                    const pcs = ppc > 0 ? rawQty * ppc : rawQty;
                    correctQty = pcs * sqmPerPiece;
                } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode)) {
                    const boxes = cpp > 0 ? rawQty * cpp : rawQty;
                    const pcs = ppc > 0 ? boxes * ppc : boxes;
                    correctQty = pcs * sqmPerPiece;
                }
            } else if (['BOX', 'CARTON', 'CRT', 'CTN'].includes(unitCode) && ppc > 0) {
                correctQty = rawQty * ppc;
            } else if (['PALLET', 'PALETTE', 'PAL'].includes(unitCode) && cpp > 0 && ppc > 0) {
                correctQty = rawQty * cpp * ppc;
            }

            const prev = purchasesByProduct.get(gri.productid) || 0;
            purchasesByProduct.set(gri.productid, prev + correctQty);
        }

        let totalPurchaseTransactions = purchasesByProduct.size;
        console.log(`[DB] Found purchases for ${totalPurchaseTransactions} distinct products in last 3 days.\n`);

        // Detailed purchases for report (use converted InventoryTransaction values since we fixed them)
        const purchasesDetailResult = await client.query(`
            SELECT 
                it.ProductID,
                p.ProductCode,
                p.ProductName,
                it.Quantity,
                it.Notes,
                it.CreatedAt
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            WHERE it.TransactionType = 'IN'
              AND it.ReferenceType = 'GOODS_RECEIPT'
              AND it.CreatedAt >= '2026-03-03 00:00:00'::timestamp
            ORDER BY it.CreatedAt DESC
        `);

        // Also check for ADJUSTMENT transactions in last 2 days
        const adjustmentsResult = await client.query(`
            SELECT 
                it.ProductID,
                p.ProductCode,
                p.ProductName,
                it.Quantity,
                it.TransactionType,
                it.Notes,
                it.CreatedAt
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            WHERE it.TransactionType = 'ADJUSTMENT'
              AND it.CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '3 days')
            ORDER BY it.CreatedAt DESC
        `);

        // ============================================================
        // STEP 5: Compare Excel + Transactions vs Current DB
        // ============================================================
        console.log('='.repeat(70));
        console.log('  COMPARISON RESULTS');
        console.log('='.repeat(70));

        const discrepancies = [];
        const matches = [];
        let noMatchInDB = 0;
        let noMatchInExcel = 0;

        // For each product in DB, find it in Excel and compute expected
        for (const dbRow of dbResult.rows) {
            const code = (dbRow.productcode || '').trim().toUpperCase();
            const name = (dbRow.productname || '').trim().toUpperCase();

            // Find in Excel
            let excelEntry = excelByCode.get(code);
            if (!excelEntry && name) {
                excelEntry = excelByName.get(name);
            }

            if (!excelEntry) {
                noMatchInExcel++;
                continue; // Product exists in DB but not in Excel
            }

            const excelQty = excelEntry.qty;
            const productId = dbRow.productid;
            const sold = salesByProduct.get(productId) || 0;
            const received = purchasesByProduct.get(productId) || 0;
            const currentQty = parseFloat(dbRow.currentqty) || 0;

            // Expected = Excel initial - sold + received
            const expectedQty = excelQty - sold + received;
            const difference = currentQty - expectedQty;

            if (Math.abs(difference) > 0.01) {
                discrepancies.push({
                    productId,
                    code: dbRow.productcode,
                    name: dbRow.productname,
                    excelQty,
                    sold,
                    received,
                    expectedQty,
                    currentQty,
                    difference
                });
            } else {
                matches.push({
                    productId,
                    code: dbRow.productcode,
                    name: dbRow.productname,
                    excelQty,
                    sold,
                    received,
                    expectedQty,
                    currentQty
                });
            }
        }

        // Sort discrepancies by absolute difference (biggest first)
        discrepancies.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

        console.log(`\nMatched & Correct: ${matches.length}`);
        console.log(`Discrepancies Found: ${discrepancies.length}`);
        console.log(`Products in DB but NOT in Excel: ${noMatchInExcel}`);

        // ============================================================
        // STEP 6: Generate detailed report
        // ============================================================
        let report = '';
        report += '='.repeat(80) + '\n';
        report += '  INVENTORY VERIFICATION REPORT\n';
        report += `  Generated: ${new Date().toISOString()}\n`;
        report += `  Comparison Period: Last 2 days (since ${new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]})\n`;
        report += '='.repeat(80) + '\n\n';

        report += '--- SUMMARY ---\n';
        report += `Products Matched & Correct (no discrepancy): ${matches.length}\n`;
        report += `Products with Discrepancies: ${discrepancies.length}\n`;
        report += `Products in DB but NOT in Excel: ${noMatchInExcel}\n`;
        report += `Products sold in last 2 days: ${totalSalesTransactions}\n`;
        report += `Products received (GR) in last 2 days: ${totalPurchaseTransactions}\n`;
        report += `Adjustments in last 2 days: ${adjustmentsResult.rows.length}\n\n`;

        // --- DISCREPANCIES ---
        if (discrepancies.length > 0) {
            report += '='.repeat(80) + '\n';
            report += '  DISCREPANCIES (Expected vs Actual)\n';
            report += '  Formula: Expected = Excel Qty - Sales + Purchases\n';
            report += '='.repeat(80) + '\n\n';

            for (let i = 0; i < discrepancies.length; i++) {
                const d = discrepancies[i];
                report += `${i + 1}. [${d.code}] ${d.name}\n`;
                report += `     Excel Qty (initial):    ${d.excelQty.toFixed(2)}\n`;
                report += `     Sales (last 2 days):  - ${d.sold.toFixed(2)}\n`;
                report += `     Purchases (last 2d):  + ${d.received.toFixed(2)}\n`;
                report += `     ---------------------------------\n`;
                report += `     Expected:                ${d.expectedQty.toFixed(2)}\n`;
                report += `     Actual (DB):             ${d.currentQty.toFixed(2)}\n`;
                report += `     DIFFERENCE:              ${d.difference > 0 ? '+' : ''}${d.difference.toFixed(2)} ${d.difference > 0 ? '(EXCESS)' : '(SHORTAGE)'}\n`;
                report += '\n';
            }
        }

        // --- SALES DETAIL ---
        if (salesDetailResult.rows.length > 0) {
            report += '='.repeat(80) + '\n';
            report += '  SALES DETAIL (Last 2 Days)\n';
            report += '='.repeat(80) + '\n\n';

            for (const s of salesDetailResult.rows) {
                const dt = new Date(s.createdat).toLocaleString('fr-FR');
                report += `  [${s.productcode}] ${s.productname}\n`;
                report += `    Qty Sold: ${parseFloat(s.quantity).toFixed(2)} | ${s.notes || ''} | ${dt}\n\n`;
            }
        }

        // --- PURCHASES DETAIL ---
        if (purchasesDetailResult.rows.length > 0) {
            report += '='.repeat(80) + '\n';
            report += '  PURCHASES DETAIL (Goods Receipts - Last 2 Days)\n';
            report += '='.repeat(80) + '\n\n';

            for (const p of purchasesDetailResult.rows) {
                const dt = new Date(p.createdat).toLocaleString('fr-FR');
                report += `  [${p.productcode}] ${p.productname}\n`;
                report += `    Qty Received: ${parseFloat(p.quantity).toFixed(2)} | ${p.notes || ''} | ${dt}\n\n`;
            }
        }

        // --- ADJUSTMENTS ---
        if (adjustmentsResult.rows.length > 0) {
            report += '='.repeat(80) + '\n';
            report += '  ADJUSTMENTS (Last 2 Days) - may explain some discrepancies\n';
            report += '='.repeat(80) + '\n\n';

            for (const a of adjustmentsResult.rows) {
                const dt = new Date(a.createdat).toLocaleString('fr-FR');
                report += `  [${a.productcode}] ${a.productname}\n`;
                report += `    Adjustment: ${parseFloat(a.quantity).toFixed(2)} | ${a.notes || ''} | ${dt}\n\n`;
            }
        }

        // --- CORRECT MATCHES (abbreviated) ---
        report += '='.repeat(80) + '\n';
        report += `  CORRECT MATCHES (${matches.length} products - qty matches expected)\n`;
        report += '='.repeat(80) + '\n\n';

        // Only show ones that had activity
        const activeMatches = matches.filter(m => m.sold > 0 || m.received > 0);
        if (activeMatches.length > 0) {
            report += `  Products with activity that are CORRECT:\n`;
            for (const m of activeMatches) {
                report += `    [${m.code}] ${m.name}: Excel=${m.excelQty.toFixed(2)}, Sold=${m.sold.toFixed(2)}, Received=${m.received.toFixed(2)}, Current=${m.currentQty.toFixed(2)} ✓\n`;
            }
        } else {
            report += `  No products with recent activity matched correctly.\n`;
        }

        // Save report
        const reportPath = path.resolve(__dirname, 'inventory_verification_report.txt');
        fs.writeFileSync(reportPath, report);
        console.log(`\nFull report saved to: ${reportPath}`);

        // Print key discrepancies to console
        if (discrepancies.length > 0) {
            console.log('\n--- TOP DISCREPANCIES ---');
            const top = discrepancies.slice(0, 20);
            for (const d of top) {
                console.log(`  [${d.code}] ${d.name}`);
                console.log(`    Excel=${d.excelQty.toFixed(2)} - Sold=${d.sold.toFixed(2)} + Recv=${d.received.toFixed(2)} = Expected ${d.expectedQty.toFixed(2)} | Actual ${d.currentQty.toFixed(2)} | Diff: ${d.difference > 0 ? '+' : ''}${d.difference.toFixed(2)}`);
            }
            if (discrepancies.length > 20) {
                console.log(`  ... and ${discrepancies.length - 20} more (see full report)`);
            }
        } else {
            console.log('\n✅ All matched products have correct inventory! No discrepancies found.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

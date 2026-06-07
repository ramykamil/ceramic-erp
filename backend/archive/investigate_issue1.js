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
 * Deep Investigation Script - Issue 1
 * ====================================
 * For each of the 59 discrepant products, check if ADJUSTMENT transactions
 * (MANUAL_ADJUSTMENT) explain the discrepancy.
 * 
 * Full formula: Expected = Excel - Sales + Purchases + Adjustments
 * If Expected == Actual → explained by adjustments
 * If Expected != Actual → unexplained, needs further investigation
 */
async function main() {
    const client = await pool.connect();
    try {
        console.log('='.repeat(70));
        console.log('  ISSUE 1: Deep Investigation - Do Adjustments Explain All 59 Discrepancies?');
        console.log('='.repeat(70));

        // ============================================================
        // STEP 1: Load Excel
        // ============================================================
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });

        const excelByCode = new Map();
        const excelByName = new Map();
        for (const row of rawData) {
            const code = (row['Reference'] || '').toString().trim().toUpperCase();
            const name = (row['Libellé'] || '').toString().trim().toUpperCase();
            const qty = parseFloat(row['Qté']) || 0;
            const entry = { code, name, qty };
            if (code) excelByCode.set(code, entry);
            if (name) excelByName.set(name, entry);
        }

        // ============================================================
        // STEP 2: Load DB products + inventory
        // ============================================================
        const dbResult = await client.query(`
            SELECT 
                p.ProductID, p.ProductCode, p.ProductName,
                COALESCE(SUM(i.QuantityOnHand), 0) as CurrentQty
            FROM Products p
            LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            WHERE p.IsActive = true
            GROUP BY p.ProductID, p.ProductCode, p.ProductName
        `);

        const dbByCode = new Map();
        for (const row of dbResult.rows) {
            const code = (row.productcode || '').trim().toUpperCase();
            if (code) dbByCode.set(code, row);
        }

        // ============================================================
        // STEP 3: Get Sales (OUT/ORDER) in last 2 days per product
        // ============================================================
        const salesResult = await client.query(`
            SELECT ProductID, SUM(Quantity) as TotalSold
            FROM InventoryTransactions
            WHERE TransactionType = 'OUT' AND ReferenceType = 'ORDER'
              AND CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
            GROUP BY ProductID
        `);
        const salesByProduct = new Map();
        for (const r of salesResult.rows) salesByProduct.set(r.productid, parseFloat(r.totalsold) || 0);

        // ============================================================
        // STEP 4: Get Purchases (IN/GOODS_RECEIPT) in last 2 days per product
        // ============================================================
        const purchasesResult = await client.query(`
            SELECT ProductID, SUM(Quantity) as TotalReceived
            FROM InventoryTransactions
            WHERE TransactionType = 'IN' AND ReferenceType = 'GOODS_RECEIPT'
              AND CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
            GROUP BY ProductID
        `);
        const purchasesByProduct = new Map();
        for (const r of purchasesResult.rows) purchasesByProduct.set(r.productid, parseFloat(r.totalreceived) || 0);

        // ============================================================
        // STEP 5: Get ALL Adjustments in last 2 days per product
        // ============================================================
        const adjustResult = await client.query(`
            SELECT ProductID, SUM(Quantity) as TotalAdjust
            FROM InventoryTransactions
            WHERE TransactionType = 'ADJUSTMENT'
              AND CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
            GROUP BY ProductID
        `);
        const adjustByProduct = new Map();
        for (const r of adjustResult.rows) adjustByProduct.set(r.productid, parseFloat(r.totaladjust) || 0);

        // Also get individual adjustment details for reporting
        const adjustDetailResult = await client.query(`
            SELECT 
                it.ProductID, p.ProductCode, p.ProductName,
                it.Quantity, it.Notes, it.CreatedAt,
                u.Username as AdjustedBy
            FROM InventoryTransactions it
            JOIN Products p ON it.ProductID = p.ProductID
            LEFT JOIN Users u ON it.CreatedBy = u.UserID
            WHERE it.TransactionType = 'ADJUSTMENT'
              AND it.CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
            ORDER BY it.CreatedAt DESC
        `);

        // ============================================================
        // STEP 6: Recalculate for all products with original discrepancies
        // ============================================================
        const explained = [];
        const stillUnexplained = [];

        for (const dbRow of dbResult.rows) {
            const code = (dbRow.productcode || '').trim().toUpperCase();
            const name = (dbRow.productname || '').trim().toUpperCase();

            let excelEntry = excelByCode.get(code);
            if (!excelEntry && name) excelEntry = excelByName.get(name);
            if (!excelEntry) continue;

            const excelQty = excelEntry.qty;
            const productId = dbRow.productid;
            const sold = salesByProduct.get(productId) || 0;
            const received = purchasesByProduct.get(productId) || 0;
            const adjust = adjustByProduct.get(productId) || 0;
            const currentQty = parseFloat(dbRow.currentqty) || 0;

            // Original formula (without adjustments)
            const expectedWithout = excelQty - sold + received;
            const diffWithout = currentQty - expectedWithout;

            // Was this originally a discrepancy?
            if (Math.abs(diffWithout) <= 0.01) continue; // Not a discrepancy, skip

            // New formula WITH adjustments
            const expectedWith = excelQty - sold + received + adjust;
            const diffWith = currentQty - expectedWith;

            const entry = {
                productId,
                code: dbRow.productcode,
                name: dbRow.productname,
                excelQty,
                sold,
                received,
                adjust,
                expectedWithout,
                expectedWith,
                currentQty,
                diffWithout,
                diffWith
            };

            if (Math.abs(diffWith) <= 0.5) {
                explained.push(entry);
            } else {
                stillUnexplained.push(entry);
            }
        }

        // ============================================================
        // STEP 7: Report
        // ============================================================
        console.log(`\n--- RESULTS ---`);
        console.log(`Discrepancies EXPLAINED by adjustments: ${explained.length}`);
        console.log(`Discrepancies STILL UNEXPLAINED: ${stillUnexplained.length}`);
        console.log(`Total: ${explained.length + stillUnexplained.length}`);

        let report = '';
        report += '='.repeat(80) + '\n';
        report += '  ISSUE 1: ADJUSTMENT CORRELATION REPORT\n';
        report += `  Generated: ${new Date().toISOString()}\n`;
        report += '='.repeat(80) + '\n\n';
        report += `Discrepancies EXPLAINED by adjustments: ${explained.length}\n`;
        report += `Discrepancies STILL UNEXPLAINED: ${stillUnexplained.length}\n\n`;

        // --- EXPLAINED ---
        if (explained.length > 0) {
            report += '--- EXPLAINED BY ADJUSTMENTS ---\n\n';
            for (const e of explained) {
                report += `  [${e.code}] ${e.name}\n`;
                report += `    Excel=${e.excelQty.toFixed(2)} - Sold=${e.sold.toFixed(2)} + Recv=${e.received.toFixed(2)} + Adjust=${e.adjust.toFixed(2)}\n`;
                report += `    Expected(with adj)=${e.expectedWith.toFixed(2)} | Actual=${e.currentQty.toFixed(2)} | Remaining Diff=${e.diffWith.toFixed(2)} ✓\n\n`;
            }
        }

        // --- UNEXPLAINED ---
        if (stillUnexplained.length > 0) {
            report += '\n--- STILL UNEXPLAINED ---\n\n';
            stillUnexplained.sort((a, b) => Math.abs(b.diffWith) - Math.abs(a.diffWith));
            for (const u of stillUnexplained) {
                report += `  [${u.code}] ${u.name}\n`;
                report += `    Excel=${u.excelQty.toFixed(2)} - Sold=${u.sold.toFixed(2)} + Recv=${u.received.toFixed(2)} + Adjust=${u.adjust.toFixed(2)}\n`;
                report += `    Expected(with adj)=${u.expectedWith.toFixed(2)} | Actual=${u.currentQty.toFixed(2)} | Remaining Diff=${u.diffWith > 0 ? '+' : ''}${u.diffWith.toFixed(2)}\n\n`;
            }

            // For unexplained ones, get their full adjustment history detail
            report += '\n--- FULL ADJUSTMENT DETAIL FOR UNEXPLAINED PRODUCTS ---\n\n';
            const unexplainedIds = new Set(stillUnexplained.map(u => u.productId));

            // Get ALL-TIME transaction history for unexplained products
            const fullHistoryResult = await client.query(`
                SELECT 
                    it.ProductID, p.ProductCode, p.ProductName,
                    it.TransactionType, it.Quantity, it.ReferenceType,
                    it.Notes, it.CreatedAt
                FROM InventoryTransactions it
                JOIN Products p ON it.ProductID = p.ProductID
                WHERE it.ProductID = ANY($1)
                ORDER BY it.ProductID, it.CreatedAt DESC
            `, [Array.from(unexplainedIds)]);

            let currentProdId = null;
            for (const h of fullHistoryResult.rows) {
                if (h.productid !== currentProdId) {
                    currentProdId = h.productid;
                    report += `\n  === [${h.productcode}] ${h.productname} ===\n`;
                }
                const dt = new Date(h.createdat).toLocaleString('fr-FR');
                report += `    ${dt} | ${h.transactiontype} | Qty: ${parseFloat(h.quantity).toFixed(2)} | ${h.referencetype || ''} | ${h.notes || ''}\n`;
            }
        }

        // Print UNEXPLAINED to console
        if (stillUnexplained.length > 0) {
            console.log('\n--- STILL UNEXPLAINED (Top 20) ---');
            for (const u of stillUnexplained.slice(0, 20)) {
                console.log(`  [${u.code}] ${u.name}`);
                console.log(`    Excel=${u.excelQty.toFixed(2)} - Sold=${u.sold.toFixed(2)} + Recv=${u.received.toFixed(2)} + Adjust=${u.adjust.toFixed(2)} = Expected ${u.expectedWith.toFixed(2)} | Actual ${u.currentQty.toFixed(2)} | Diff: ${u.diffWith > 0 ? '+' : ''}${u.diffWith.toFixed(2)}`);
            }
        } else {
            console.log('\n✅ ALL 59 discrepancies are explained by manual adjustments!');
        }

        // Also print explained count
        if (explained.length > 0) {
            console.log(`\n--- EXPLAINED BY ADJUSTMENTS (${explained.length}) ---`);
            for (const e of explained.slice(0, 10)) {
                console.log(`  [${e.code}] ${e.name}: Adjust=${e.adjust.toFixed(2)}, now matches ✓`);
            }
            if (explained.length > 10) console.log(`  ... and ${explained.length - 10} more`);
        }

        const reportPath = path.resolve(__dirname, 'issue1_adjustment_correlation.txt');
        fs.writeFileSync(reportPath, report);
        console.log(`\nFull report saved to: ${reportPath}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

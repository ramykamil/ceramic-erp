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
 * Deep Investigation - Issue 1 Part 2
 * ====================================
 * For the 32 still-unexplained products, check their COMPLETE
 * transaction history (ALL time) to understand the difference.
 * 
 * Hypothesis: The "2 day" window might miss older transactions 
 * that also affected inventory. We need to check if the Excel 
 * snapshot was truly the starting point or if there were earlier
 * transactions not captured.
 */
async function main() {
    const client = await pool.connect();
    try {
        console.log('='.repeat(70));
        console.log('  ISSUE 1 Part 2: Full Transaction Audit for Unexplained Products');
        console.log('='.repeat(70));

        // Load Excel
        const filePath = path.resolve(__dirname, '../Table Produit NOUVEAUX.xls');
        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: null });

        const excelByCode = new Map();
        const excelByName = new Map();
        for (const row of rawData) {
            const code = (row['Reference'] || '').toString().trim().toUpperCase();
            const name = (row['Libellé'] || '').toString().trim().toUpperCase();
            const qty = parseFloat(row['Qté']) || 0;
            if (code) excelByCode.set(code, { code, name, qty });
            if (name) excelByName.set(name, { code, name, qty });
        }

        // Load DB inventory
        const dbResult = await client.query(`
            SELECT p.ProductID, p.ProductCode, p.ProductName,
                   COALESCE(SUM(i.QuantityOnHand), 0) as CurrentQty
            FROM Products p LEFT JOIN Inventory i ON p.ProductID = i.ProductID
            WHERE p.IsActive = true
            GROUP BY p.ProductID, p.ProductCode, p.ProductName
        `);

        // Get ALL transactions in last 2 days grouped by product
        const allTxResult = await client.query(`
            SELECT ProductID, TransactionType, ReferenceType, SUM(Quantity) as Total
            FROM InventoryTransactions
            WHERE CreatedAt >= (CURRENT_TIMESTAMP - INTERVAL '2 days')
            GROUP BY ProductID, TransactionType, ReferenceType
        `);

        // Build a structured map: productId -> { sales, purchases, adjustments }
        const txMap = new Map();
        for (const tx of allTxResult.rows) {
            if (!txMap.has(tx.productid)) txMap.set(tx.productid, { sales: 0, purchases: 0, adjustments: 0 });
            const entry = txMap.get(tx.productid);
            const qty = parseFloat(tx.total) || 0;
            if (tx.transactiontype === 'OUT' && tx.referencetype === 'ORDER') entry.sales += qty;
            else if (tx.transactiontype === 'IN' && tx.referencetype === 'GOODS_RECEIPT') entry.purchases += qty;
            else if (tx.transactiontype === 'ADJUSTMENT') entry.adjustments += qty;
            else if (tx.transactiontype === 'IN') entry.purchases += qty; // other IN types
            else if (tx.transactiontype === 'OUT') entry.sales += qty; // other OUT types
        }

        // Find the 32 unexplained
        let report = '';
        report += '='.repeat(80) + '\n';
        report += '  FULL TRANSACTION AUDIT FOR UNEXPLAINED DISCREPANCIES\n';
        report += '='.repeat(80) + '\n\n';

        let unexplainedCount = 0;
        const unexplainedProducts = [];

        for (const dbRow of dbResult.rows) {
            const code = (dbRow.productcode || '').trim().toUpperCase();
            const name = (dbRow.productname || '').trim().toUpperCase();
            let excel = excelByCode.get(code) || excelByName.get(name);
            if (!excel) continue;

            const productId = dbRow.productid;
            const tx = txMap.get(productId) || { sales: 0, purchases: 0, adjustments: 0 };
            const currentQty = parseFloat(dbRow.currentqty) || 0;

            const expectedFull = excel.qty - tx.sales + tx.purchases + tx.adjustments;
            const diff = currentQty - expectedFull;

            if (Math.abs(diff) > 0.5) {
                unexplainedCount++;
                unexplainedProducts.push(productId);

                report += `\n${'─'.repeat(60)}\n`;
                report += `${unexplainedCount}. [${dbRow.productcode}] ${dbRow.productname}\n`;
                report += `   Excel Qty:    ${excel.qty.toFixed(2)}\n`;
                report += `   Sales (2d):   ${tx.sales.toFixed(2)}\n`;
                report += `   Purchase(2d): ${tx.purchases.toFixed(2)}\n`;
                report += `   Adjust (2d):  ${tx.adjustments.toFixed(2)}\n`;
                report += `   Expected:     ${expectedFull.toFixed(2)}\n`;
                report += `   Actual DB:    ${currentQty.toFixed(2)}\n`;
                report += `   GAP:          ${diff > 0 ? '+' : ''}${diff.toFixed(2)}\n`;
            }
        }

        // For each unexplained product, get their COMPLETE transaction history
        if (unexplainedProducts.length > 0) {
            report += '\n\n' + '='.repeat(80) + '\n';
            report += '  COMPLETE TRANSACTION HISTORY (ALL TIME) FOR EACH UNEXPLAINED PRODUCT\n';
            report += '='.repeat(80) + '\n';

            const histResult = await client.query(`
                SELECT 
                    it.ProductID, p.ProductCode, p.ProductName,
                    it.TransactionType, it.Quantity, it.ReferenceType,
                    it.ReferenceID, it.Notes, it.CreatedAt
                FROM InventoryTransactions it
                JOIN Products p ON it.ProductID = p.ProductID
                WHERE it.ProductID = ANY($1)
                ORDER BY it.ProductID, it.CreatedAt ASC
            `, [unexplainedProducts]);

            let currentProd = null;
            let runningTotal = 0;
            for (const h of histResult.rows) {
                if (h.productid !== currentProd) {
                    currentProd = h.productid;
                    runningTotal = 0;
                    const excel = excelByCode.get((h.productcode || '').toUpperCase()) || excelByName.get((h.productname || '').toUpperCase());
                    runningTotal = excel ? excel.qty : 0;
                    report += `\n\n${'═'.repeat(60)}\n`;
                    report += `[${h.productcode}] ${h.productname}\n`;
                    report += `Excel Starting Qty: ${runningTotal.toFixed(2)}\n`;
                    report += `${'─'.repeat(60)}\n`;
                    report += `${'Date'.padEnd(22)} | ${'Type'.padEnd(12)} | ${'Ref'.padEnd(18)} | ${'Qty'.padStart(12)} | ${'Running'.padStart(12)} | Notes\n`;
                    report += `${'─'.repeat(120)}\n`;
                }

                const qty = parseFloat(h.quantity) || 0;
                // Determine effect on running total
                if (h.transactiontype === 'OUT') {
                    runningTotal -= qty;
                } else if (h.transactiontype === 'IN') {
                    runningTotal += qty;
                } else if (h.transactiontype === 'ADJUSTMENT') {
                    runningTotal += qty; // adjustment quantity is the delta
                }

                const dt = new Date(h.createdat).toISOString().replace('T', ' ').substring(0, 19);
                const qtyStr = (h.transactiontype === 'OUT' ? '-' : '+') + Math.abs(qty).toFixed(2);
                report += `${dt.padEnd(22)} | ${h.transactiontype.padEnd(12)} | ${(h.referencetype || '').padEnd(18)} | ${qtyStr.padStart(12)} | ${runningTotal.toFixed(2).padStart(12)} | ${(h.notes || '').substring(0, 40)}\n`;
            }

            // Also check for the 2-day boundary issue
            report += '\n\n' + '='.repeat(80) + '\n';
            report += '  INVESTIGATION: TRANSACTIONS OLDER THAN 2 DAYS FOR THESE PRODUCTS\n';
            report += '='.repeat(80) + '\n\n';

            const olderTxResult = await client.query(`
                SELECT 
                    it.ProductID, p.ProductCode, p.ProductName,
                    it.TransactionType, SUM(it.Quantity) as Total, COUNT(*) as Count,
                    it.ReferenceType
                FROM InventoryTransactions it
                JOIN Products p ON it.ProductID = p.ProductID
                WHERE it.ProductID = ANY($1)
                  AND it.CreatedAt < (CURRENT_TIMESTAMP - INTERVAL '2 days')
                GROUP BY it.ProductID, p.ProductCode, p.ProductName, it.TransactionType, it.ReferenceType
                ORDER BY p.ProductCode, it.TransactionType
            `, [unexplainedProducts]);

            let curProd = null;
            for (const o of olderTxResult.rows) {
                if (o.productid !== curProd) {
                    curProd = o.productid;
                    report += `\n  [${o.productcode}] ${o.productname}:\n`;
                }
                report += `    ${o.transactiontype} / ${o.referencetype || 'N/A'}: Total=${parseFloat(o.total).toFixed(2)}, Count=${o.count}\n`;
            }
        }

        console.log(`\nTotal still unexplained: ${unexplainedCount}`);

        const reportPath = path.resolve(__dirname, 'issue1_deep_audit.txt');
        fs.writeFileSync(reportPath, report);
        console.log(`Full audit report saved to: ${reportPath}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

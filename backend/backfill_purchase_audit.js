/**
 * Backfill AuditLogs for Purchase Orders created since April 8, 2026
 * 
 * This script retroactively inserts CREATE_PURCHASE audit entries
 * for POs that were created before audit logging was added.
 * 
 * Run from the backend directory: node backfill_purchase_audit.js
 */
require('dotenv').config();
const pool = require('./src/config/database');

async function backfill() {
    try {
        console.log('🔄 Backfilling purchase order audit logs...\n');

        // Get all POs from April 8 onwards with creator info
        const result = await pool.query(`
            SELECT 
                po.PurchaseOrderID,
                po.PONumber,
                po.OrderDate,
                po.TotalAmount,
                po.CreatedBy,
                po.CreatedAt,
                u.Username,
                COALESCE(f.FactoryName, b.BrandName, 'N/A') as SupplierName,
                (SELECT COUNT(*) FROM PurchaseOrderItems poi WHERE poi.PurchaseOrderID = po.PurchaseOrderID) as ItemCount
            FROM PurchaseOrders po
            LEFT JOIN Users u ON po.CreatedBy = u.UserID
            LEFT JOIN Factories f ON po.FactoryID = f.FactoryID
            LEFT JOIN Brands b ON po.BrandID = b.BrandID
            WHERE po.OrderDate >= '2026-04-08'
            ORDER BY po.OrderDate ASC
        `);

        console.log(`Found ${result.rows.length} purchase orders since April 8, 2026:\n`);
        console.log('─'.repeat(120));
        console.log(
            'Date'.padEnd(12) +
            'PO Number'.padEnd(20) +
            'Supplier'.padEnd(30) +
            'Amount'.padEnd(15) +
            'Items'.padEnd(8) +
            'Created By'.padEnd(20)
        );
        console.log('─'.repeat(120));

        let inserted = 0;
        for (const po of result.rows) {
            console.log(
                String(po.orderdate).padEnd(12) +
                String(po.ponumber).padEnd(20) +
                String(po.suppliername).substring(0, 28).padEnd(30) +
                String(Number(po.totalamount).toLocaleString('fr-FR') + ' DA').padEnd(15) +
                String(po.itemcount).padEnd(8) +
                String(po.username || 'N/A').padEnd(20)
            );

            // Check if audit entry already exists
            const existing = await pool.query(
                `SELECT 1 FROM AuditLogs WHERE Action = 'CREATE_PURCHASE' AND TableName = 'PurchaseOrders' AND RecordID = $1 LIMIT 1`,
                [po.purchaseorderid]
            );

            if (existing.rows.length === 0) {
                // Insert the audit log entry with the original creation timestamp
                await pool.query(`
                    INSERT INTO AuditLogs (UserID, Action, TableName, RecordID, OldValues, NewValues, CreatedAt)
                    VALUES ($1, 'CREATE_PURCHASE', 'PurchaseOrders', $2, NULL, $3, $4)
                `, [
                    po.createdby,
                    po.purchaseorderid,
                    JSON.stringify({
                        poNumber: po.ponumber,
                        supplierName: po.suppliername,
                        totalAmount: Number(po.totalamount),
                        itemCount: Number(po.itemcount),
                        payment: 0,
                    }),
                    po.createdat || po.orderdate
                ]);
                inserted++;
            }
        }

        console.log('─'.repeat(120));
        console.log(`\n✅ Done! Inserted ${inserted} new audit log entries.`);
        if (inserted < result.rows.length) {
            console.log(`   (${result.rows.length - inserted} entries already existed)`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

backfill();

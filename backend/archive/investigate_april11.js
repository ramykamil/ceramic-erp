/**
 * Investigate all Purchase Orders dated April 11, 2026
 */
require('dotenv').config();
const pool = require('./src/config/database');

async function investigate() {
    try {
        // 1. Get ALL POs with OrderDate = 2026-04-11
        const posByDate = await pool.query(
            "SELECT " +
            "po.PurchaseOrderID, po.PONumber, po.OrderDate, po.Status, po.TotalAmount, " +
            "po.OwnershipType, po.CreatedBy, po.CreatedAt, po.BrandID, po.FactoryID, " +
            "u.Username, " +
            "COALESCE(f.FactoryName, b.BrandName, 'N/A') as SupplierName, " +
            "w.WarehouseName, " +
            "(SELECT COUNT(*) FROM PurchaseOrderItems poi WHERE poi.PurchaseOrderID = po.PurchaseOrderID) as ItemCount " +
            "FROM PurchaseOrders po " +
            "LEFT JOIN Users u ON po.CreatedBy = u.UserID " +
            "LEFT JOIN Factories f ON po.FactoryID = f.FactoryID " +
            "LEFT JOIN Brands b ON po.BrandID = b.BrandID " +
            "LEFT JOIN Warehouses w ON po.WarehouseID = w.WarehouseID " +
            "WHERE po.OrderDate = '2026-04-11' " +
            "ORDER BY po.CreatedAt ASC"
        );

        console.log("=== ALL PURCHASE ORDERS WITH OrderDate = 2026-04-11 ===");
        console.log("Total found:", posByDate.rows.length);
        console.log("");
        posByDate.rows.forEach(function(po, i) {
            console.log("#" + (i+1));
            console.log("  PO Number:    ", po.ponumber);
            console.log("  OrderDate:    ", po.orderdate);
            console.log("  CreatedAt:    ", new Date(po.createdat).toISOString());
            console.log("  Status:       ", po.status);
            console.log("  Supplier:     ", po.suppliername);
            console.log("  Total:        ", Number(po.totalamount).toLocaleString("fr-FR"), "DA");
            console.log("  Items:        ", po.itemcount);
            console.log("  Created By:   ", po.username, "(UserID:", po.createdby + ")");
            console.log("  Warehouse:    ", po.warehousename);
            console.log("  Ownership:    ", po.ownershiptype);
            console.log("");
        });

        // 2. Also check POs CREATED on April 11 (by timestamp, regardless of OrderDate)
        const posCreatedOn11 = await pool.query(
            "SELECT " +
            "po.PurchaseOrderID, po.PONumber, po.OrderDate, po.Status, po.TotalAmount, " +
            "po.CreatedAt, u.Username, " +
            "COALESCE(f.FactoryName, b.BrandName, 'N/A') as SupplierName " +
            "FROM PurchaseOrders po " +
            "LEFT JOIN Users u ON po.CreatedBy = u.UserID " +
            "LEFT JOIN Factories f ON po.FactoryID = f.FactoryID " +
            "LEFT JOIN Brands b ON po.BrandID = b.BrandID " +
            "WHERE po.CreatedAt >= '2026-04-11 00:00:00' AND po.CreatedAt < '2026-04-12 00:00:00' " +
            "ORDER BY po.CreatedAt ASC"
        );

        console.log("=== POs ACTUALLY CREATED ON APRIL 11 (by CreatedAt timestamp) ===");
        console.log("Total found:", posCreatedOn11.rows.length);
        console.log("");
        posCreatedOn11.rows.forEach(function(po, i) {
            console.log("#" + (i+1), po.ponumber, "| OrderDate:", po.orderdate, "|", po.suppliername, "|", Number(po.totalamount).toLocaleString("fr-FR"), "DA |", po.username, "|", po.status, "| CreatedAt:", new Date(po.createdat).toISOString());
        });

        // 3. Check for any POs with OrderDate April 11 that got DELETED
        // We check our new audit log AND also check if there are gaps in PO numbers
        console.log("");
        console.log("=== CHECKING FOR MISSING/DELETED POs ===");
        
        // Get the PO number range around April 11
        const allPONumbers = await pool.query(
            "SELECT PONumber, PurchaseOrderID, OrderDate, Status, CreatedAt " +
            "FROM PurchaseOrders " +
            "WHERE OrderDate BETWEEN '2026-04-10' AND '2026-04-12' " +
            "ORDER BY PurchaseOrderID ASC"
        );
        
        console.log("PO IDs around April 10-12 (checking for gaps):");
        var prevId = null;
        allPONumbers.rows.forEach(function(po) {
            var gap = "";
            if (prevId && (po.purchaseorderid - prevId) > 1) {
                gap = " *** GAP: missing IDs " + (prevId + 1) + " to " + (po.purchaseorderid - 1) + " ***";
            }
            console.log("  ID:", po.purchaseorderid, "| PO:", po.ponumber, "| Date:", po.orderdate, "| Status:", po.status, "| Created:", new Date(po.createdat).toISOString() + gap);
            prevId = po.purchaseorderid;
        });

        // 4. Check CashTransactions for April 11 purchase payments
        console.log("");
        console.log("=== PURCHASE PAYMENTS ON APRIL 11 ===");
        const payments = await pool.query(
            "SELECT ct.TransactionID, ct.Amount, ct.TransactionType, ct.ReferenceType, ct.ReferenceID, " +
            "ct.CreatedAt, ct.Motif, ct.Notes " + 
            "FROM CashTransactions ct " +
            "WHERE ct.TransactionType IN ('ACHAT', 'PAIEMENT') " +
            "AND ct.ReferenceType = 'PURCHASE' " +
            "AND ct.CreatedAt >= '2026-04-11 00:00:00' AND ct.CreatedAt < '2026-04-12 00:00:00' " +
            "ORDER BY ct.CreatedAt"
        );
        console.log("Total payments:", payments.rows.length);
        payments.rows.forEach(function(p) {
            console.log("  Amount:", Number(p.amount).toLocaleString("fr-FR"), "DA | Type:", p.transactiontype, "| PO ID:", p.referenceid, "| At:", new Date(p.createdat).toISOString(), "| Notes:", p.motif || p.notes || "-");
        });

        // 5. Check GoodsReceipts for April 11
        console.log("");
        console.log("=== GOODS RECEIPTS LINKED TO APRIL 11 POs ===");
        const grs = await pool.query(
            "SELECT gr.ReceiptID, gr.ReceiptNumber, gr.PurchaseOrderID, gr.ReceiptDate, gr.Status, " +
            "gr.CreatedAt, po.PONumber " +
            "FROM GoodsReceipts gr " +
            "JOIN PurchaseOrders po ON gr.PurchaseOrderID = po.PurchaseOrderID " +
            "WHERE po.OrderDate = '2026-04-11' " +
            "ORDER BY gr.CreatedAt"
        );
        console.log("Total:", grs.rows.length);
        grs.rows.forEach(function(gr) {
            console.log("  GR:", gr.receiptnumber, "| PO:", gr.ponumber, "| Date:", gr.receiptdate, "| Status:", gr.status, "| Created:", new Date(gr.createdat).toISOString());
        });

    } catch (err) {
        console.error("ERROR:", err.message);
        console.error(err.stack);
    } finally {
        await pool.end();
    }
}

investigate();

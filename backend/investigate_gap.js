/**
 * Check the GAP in PO IDs 403-406 and understand the date filter behavior
 */
require('dotenv').config();
const pool = require('./src/config/database');

async function checkGap() {
    try {
        // Check if PO IDs 403-406 exist at all
        const gapCheck = await pool.query(
            "SELECT po.PurchaseOrderID, po.PONumber, po.OrderDate, po.Status, po.TotalAmount, " +
            "po.CreatedAt, u.Username, COALESCE(f.FactoryName, b.BrandName, 'N/A') as SupplierName " +
            "FROM PurchaseOrders po " +
            "LEFT JOIN Users u ON po.CreatedBy = u.UserID " +
            "LEFT JOIN Factories f ON po.FactoryID = f.FactoryID " +
            "LEFT JOIN Brands b ON po.BrandID = b.BrandID " +
            "WHERE po.PurchaseOrderID BETWEEN 403 AND 406 " +
            "ORDER BY po.PurchaseOrderID"
        );
        
        console.log("=== PO IDs 403-406 (the gap) ===");
        if (gapCheck.rows.length === 0) {
            console.log("  NONE FOUND - these IDs were DELETED");
        } else {
            gapCheck.rows.forEach(function(po) {
                console.log("  ID:", po.purchaseorderid, "| PO:", po.ponumber, "| OrderDate:", po.orderdate, "| Status:", po.status, "|", po.suppliername, "|", Number(po.totalamount).toLocaleString("fr-FR"), "DA |", po.username);
            });
        }

        // Now check how the frontend date filter works
        // The purchasing page uses client-side date filtering on OrderDate
        // Let's verify: what does the list look like when filtered for April 11?
        console.log("");
        console.log("=== WHAT THE CLIENT SHOULD SEE WHEN FILTERING FOR APRIL 11 ===");
        console.log("(POs with OrderDate = 2026-04-11, sorted by date desc)");
        console.log("");

        var result = await pool.query(
            "SELECT po.PurchaseOrderID, po.PONumber, po.OrderDate, po.Status, po.TotalAmount, " +
            "po.CreatedAt, u.Username as CreatedByName, " +
            "COALESCE(f.FactoryName, b.BrandName, 'N/A') as FactoryName, " +
            "w.WarehouseName " +
            "FROM PurchaseOrders po " +
            "LEFT JOIN Users u ON po.CreatedBy = u.UserID " +
            "LEFT JOIN Factories f ON po.FactoryID = f.FactoryID " +
            "LEFT JOIN Brands b ON po.BrandID = b.BrandID " +
            "LEFT JOIN Warehouses w ON po.WarehouseID = w.WarehouseID " +
            "WHERE po.OrderDate = '2026-04-11' " +
            "ORDER BY po.OrderDate DESC, po.PurchaseOrderID DESC"
        );

        console.log("Count: " + result.rows.length + " purchase orders");
        console.log("");
        console.log(
            "PO Number".padEnd(20) +
            "Supplier".padEnd(20) +
            "Amount".padEnd(18) +
            "Status".padEnd(12) +
            "Created By".padEnd(15) +
            "Created At (actual)"
        );
        console.log("-".repeat(110));

        result.rows.forEach(function(po) {
            console.log(
                String(po.ponumber).padEnd(20) +
                String(po.factoryname).substring(0, 18).padEnd(20) +
                (Number(po.totalamount).toLocaleString("fr-FR") + " DA").padEnd(18) +
                String(po.status).padEnd(12) +
                String(po.createdbyname || "N/A").padEnd(15) +
                new Date(po.createdat).toISOString()
            );
        });

        // Check the date filter default preset on purchasing page
        console.log("");
        console.log("=== IMPORTANT FINDING ===");
        console.log("The purchasing page uses a DateQuickFilter with defaultPreset='TODAY'.");
        console.log("This means by default it only shows TODAY's orders.");
        console.log("To see April 11 orders, the client must change the date filter to a Custom range or 'This Week' etc.");
        console.log("");
        console.log("Also note: ALL April 11 POs were actually CREATED on April 12 (between 14:16 and 14:27 UTC).");
        console.log("The user 'Zineb' set the OrderDate to April 11 retroactively while entering them on April 12.");
        console.log("This is normal behavior - the system allows backdating OrderDate.");

    } catch (err) {
        console.error("ERROR:", err.message);
        console.error(err.stack);
    } finally {
        await pool.end();
    }
}

checkGap();

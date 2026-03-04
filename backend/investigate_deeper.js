require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        // Check if inventoryid 9146 is the ORIGINAL or if it was recreated
        // by looking at inferred sequence gaps
        const nearbyInv = await pool.query(`
            SELECT inventoryid, productid, quantityonhand, updatedat 
            FROM Inventory 
            WHERE inventoryid BETWEEN 9140 AND 9160 
            ORDER BY inventoryid
        `);
        console.log("Nearby inventory records:", nearbyInv.rows);

        // Check the max inventory id to understand when 9146 was created
        const maxInv = await pool.query(`SELECT MAX(inventoryid) as maxid FROM Inventory`);
        console.log("Max inventory ID:", maxInv.rows[0]);

        // The critical question: was inventory reset by duplicate cleanup?
        // Let's check what happened around the duplicate cleanup time
        // The conversation 290c7bfc says "Final Duplicate Cleanup" on March 1-2
        // Let's check when inventory record 9146 was first populated

        // The first GoodsReceipt transaction for product 37 is txn 14916 at 2026-02-28
        // But the inventoryid is 9146. If original inventory was created during product creation
        // (product created 2025-12-20), the inventoryid should be much lower.

        // Let's check what inventoryid the OLD record would have been
        const oldInvCheck = await pool.query(`
            SELECT MIN(inventoryid) as minid FROM Inventory
        `);
        console.log("Min inventory ID:", oldInvCheck.rows[0]);

        // Let's check if there was a script that deleted and recreated inventory
        // by looking at inventoryids for some products that were created early
        const earlyProducts = await pool.query(`
            SELECT i.inventoryid, i.productid, p.productname, p.createdat
            FROM Inventory i 
            JOIN Products p ON i.productid = p.productid
            WHERE p.productid IN (1, 2, 3, 37, 38, 39, 40)
            ORDER BY p.productid
        `);
        console.log("Early product inventory IDs:", earlyProducts.rows);

        // Check if there's a "correct_inventory" or similar script that might have zeroed it
        // Let's verify: was the inventory just recently set to 0 explicitly, or has it been
        // accumulating incorrectly?

        // Most importantly: let's check the ACTUAL sequence of events
        // by looking at what happened between the last IN and the inventory being 0

        // Last GR was at 2026-03-04T08:40:31 (txn 15535, +10368)
        // Then:
        // - OUT 116.64 at 2026-03-04T10:14 (txn 15583)
        // - OUT 233.28 at 2026-03-04T10:46 (txn 15607)
        // Inventory updatedat matches last OUT: 2026-03-04T10:46:17

        // So the inventory was last updated when the last sale happened
        // This suggests the inventory was already very low before that last sale
        // and the GREATEST(0, qty - deduction) clipped it to 0

        // But from transactions sum: total IN pieces = 26496 + 1844.37 = 28340.37
        // total OUT = all outs + adjustments = 4590.27
        // So net = 23750.10
        // This can't be 0 unless the inventory decrements were WAY more than recorded

        // HYPOTHESIS: The GoodsReceipt adds PIECES (e.g. 5184) to inventory,
        // but the finalizeOrder code ACTUALLY deducts PIECES too (because the unit
        // conversion converts SQM to pieces)... wait let me re-read the code

        // Actually wait - the order items have unitcode 'SQM' and quantity like 524.88
        // At finalizeOrder line 639: isSoldInPieces = (unitcode === 'PCS') = FALSE
        // So the conversion at line 645 does NOT trigger
        // qtyToDeduct stays as 524.88 (the raw SQM value)
        // 
        // BUT the inventory is in PIECES (because GoodsReceipt stored pieces)!
        // So we're subtracting 524.88 SQM from a PIECES-denominated inventory
        // This means inventory goes down slowly (SQM < pieces)
        // But it still should be 23750... unless the inventory record was RECREATED

        // Let me check: was there an inventory record deletion + recreation?
        // Check if the correct_inventory.js script was run

        // Actually, let me just check: is the CURRENT inventory consistent with
        // "all goods receipts were recorded but starting from 0"?
        // i.e., if inventory was reset to 0 at some point, then GRs added pieces
        // and sales subtracted SQM

        // Check: When was inventoryid 9146 created? It's a high ID suggesting recent creation
        // Products created on 2025-12-20 should have had inventory IDs in the low hundreds

        // FINAL CHECK: was there a script that recalculated inventory from net transactions?
        // The correct_inventory.js could have set inventory based on net (purchases - sales)
        // but using WRONG units (mixing pieces and SQM)

        // Let me check the correct_inventory.js
        console.log("\nChecking if inventory was reset by scripts...");

        // Find products with inventory created recently (high inventoryid)
        const recentInv = await pool.query(`
            SELECT COUNT(*) as count, MIN(inventoryid) as minid, MAX(inventoryid) as maxid
            FROM Inventory
        `);
        console.log("Inventory table stats:", recentInv.rows[0]);

        // Check for any inventory record for product 37 that was deleted
        // (we can't check deleted records directly, but we can check patterns)

        // Let's try a different approach: recalculate what inventory SHOULD be
        // based on GOODS_RECEIPT quantities received vs OrderItems quantities sold

        // Goods Receipts for product 37:
        const grItems = await pool.query(`
            SELECT gri.quantityreceived, u.unitcode
            FROM GoodsReceiptItems gri
            LEFT JOIN Units u ON gri.unitid = u.unitid
            WHERE gri.productid = 37
        `);
        console.log("\nGoods Receipt Items (actual received):", grItems.rows);

        // Total received in SQM
        const totalReceivedSQM = grItems.rows.reduce((s, r) => s + parseFloat(r.quantityreceived), 0);
        console.log("Total received (SQM):", totalReceivedSQM);

        // Total sold
        const totalSold = await pool.query(`
            SELECT SUM(oi.quantity) as total, MIN(u.unitcode) as unitcode
            FROM OrderItems oi
            LEFT JOIN Units u ON oi.unitid = u.unitid
            WHERE oi.productid = 37
        `);
        console.log("Total sold:", totalSold.rows[0]);

        // Expected inventory in SQM = received - sold
        const expectedSQM = totalReceivedSQM - parseFloat(totalSold.rows[0].total || 0);
        console.log("Expected inventory (SQM):", expectedSQM);

        // But inventory is currently stored in PIECES (due to GR conversion)
        // 45/45 = 0.2025 sqm/piece
        const sqmPerPiece = 0.2025;
        const expectedPieces = expectedSQM / sqmPerPiece;
        console.log("Expected inventory (PCS):", expectedPieces);
        console.log("Expected inventory (SQM from PCS):", expectedPieces * sqmPerPiece);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

main();

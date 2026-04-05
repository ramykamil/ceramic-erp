require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixInventory() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ===== FIX 1: COTTO ROJO TERRE CUITE 45/45 (Product 37) =====
        console.log("===== FIXING: COTTO ROJO TERRE CUITE 45/45 (ID: 37) =====");

        // Correct expected inventory = Total GR Received (SQM) - Total Sold (SQM)
        // GoodsReceiptItems: 1049.76 + 1166.40 + 1049.76 + 2099.52 = 5365.44 SQM
        // OrderItems sold (non-cancelled): 2104.38 SQM 
        // Expected: 5365.44 - 2104.38 = 3261.06 SQM

        // However, inventory is currently stored in PIECES due to GR conversion bug
        // We need to decide: store in SQM (correct) or PIECES?
        // Since the product has primaryunitid=1 (PCS), and GR converts to pieces,
        // and sales also deduct in the order item unit...
        // The correct approach: recalculate based on actual GR received SQM - sold SQM

        // Get actual total received from GoodsReceiptItems
        const grTotal = await client.query(`
            SELECT COALESCE(SUM(gri.quantityreceived), 0) as total_received
            FROM GoodsReceiptItems gri
            WHERE gri.productid = 37
        `);
        const totalReceived = parseFloat(grTotal.rows[0].total_received);
        console.log(`  Total received (SQM from GR): ${totalReceived}`);

        // Get actual total sold from OrderItems (non-cancelled orders only)
        const salesTotal = await client.query(`
            SELECT COALESCE(SUM(oi.quantity), 0) as total_sold
            FROM OrderItems oi
            JOIN Orders o ON oi.orderid = o.orderid
            WHERE oi.productid = 37 AND o.status NOT IN ('CANCELLED')
        `);
        const totalSold = parseFloat(salesTotal.rows[0].total_sold);
        console.log(`  Total sold (SQM): ${totalSold}`);

        const correctQty = totalReceived - totalSold;
        console.log(`  Correct inventory (SQM): ${correctQty}`);

        // Get packaging info
        const pkg37 = await client.query(`SELECT qteparcolis, qtecolisparpalette FROM Products WHERE productid = 37`);
        const ppc37 = parseFloat(pkg37.rows[0].qteparcolis) || 0;
        const cpp37 = parseFloat(pkg37.rows[0].qtecolisparpalette) || 0;
        const colis37 = ppc37 > 0 ? parseFloat((correctQty / ppc37).toFixed(4)) : 0;
        const pallets37 = cpp37 > 0 ? parseFloat((colis37 / cpp37).toFixed(4)) : 0;

        // Update inventory
        await client.query(`
            UPDATE Inventory SET 
                QuantityOnHand = $1,
                QuantityReserved = 0,
                ColisCount = $2,
                PalletCount = $3,
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE productid = 37 AND ownershiptype = 'OWNED'
        `, [correctQty, colis37, pallets37]);

        console.log(`  ✅ Updated inventory: qty=${correctQty}, colis=${colis37}, pallets=${pallets37}`);

        // Record adjustment transaction
        await client.query(`
            INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
            VALUES (37, 1, 'ADJUSTMENT', $1, 'MANUAL_ADJUSTMENT', 'Fix: Recalculated from GoodsReceipts (SQM) minus Sales - correcting unit conversion and cleanup script errors', 7, 'OWNED')
        `, [correctQty]);

        // Delete all old incorrect transactions and re-zero the starting point
        // Actually, it's better to just add an adjustment transaction that brings balance to correct value
        // The adjustment already sets the correct value via UPDATE above


        // ===== FIX 2: BERLIN MARON 20/75 (Product 4049) =====
        console.log("\n===== FIXING: BERLIN MARON 20/75 (ID: 4049) =====");

        // Issue: 108 SQM received, converted to 720 pieces, stored as 720
        // The correct inventory should be 108 SQM (the actual amount received)
        // since there are NO sales for this product

        // Get actual received
        const grBerlin = await client.query(`
            SELECT COALESCE(SUM(gri.quantityreceived), 0) as total_received
            FROM GoodsReceiptItems gri
            WHERE gri.productid = 4049
        `);
        const berlinReceived = parseFloat(grBerlin.rows[0].total_received);
        console.log(`  Total received (SQM from GR): ${berlinReceived}`);

        // Get sales
        const berlinSales = await client.query(`
            SELECT COALESCE(SUM(oi.quantity), 0) as total_sold
            FROM OrderItems oi
            JOIN Orders o ON oi.orderid = o.orderid
            WHERE oi.productid = 4049 AND o.status NOT IN ('CANCELLED')
        `);
        const berlinSold = parseFloat(berlinSales.rows[0].total_sold);
        console.log(`  Total sold: ${berlinSold}`);

        const berlinCorrectQty = berlinReceived - berlinSold;
        console.log(`  Correct inventory (SQM): ${berlinCorrectQty}`);

        // Get packaging info
        const pkg4049 = await client.query(`SELECT qteparcolis, qtecolisparpalette FROM Products WHERE productid = 4049`);
        const ppc4049 = parseFloat(pkg4049.rows[0].qteparcolis) || 0;
        const cpp4049 = parseFloat(pkg4049.rows[0].qtecolisparpalette) || 0;
        const colis4049 = ppc4049 > 0 ? parseFloat((berlinCorrectQty / ppc4049).toFixed(4)) : 0;
        const pallets4049 = cpp4049 > 0 ? parseFloat((colis4049 / cpp4049).toFixed(4)) : 0;

        // Update inventory
        await client.query(`
            UPDATE Inventory SET 
                QuantityOnHand = $1,
                QuantityReserved = 0,
                ColisCount = $2,
                PalletCount = $3,
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE productid = 4049 AND ownershiptype = 'OWNED'
        `, [berlinCorrectQty, colis4049, pallets4049]);

        console.log(`  ✅ Updated inventory: qty=${berlinCorrectQty}, colis=${colis4049}, pallets=${pallets4049}`);

        // Record adjustment transaction
        await client.query(`
            INSERT INTO InventoryTransactions (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, Notes, CreatedBy, OwnershipType)
            VALUES (4049, 1, 'ADJUSTMENT', $1, 'MANUAL_ADJUSTMENT', 'Fix: Recalculated from GoodsReceipts (SQM) minus Sales - correcting GR unit conversion from SQM to pieces', 7, 'OWNED')
        `, [berlinCorrectQty - 720]); // Adjustment from current 720 to correct amount

        await client.query('COMMIT');
        console.log("\n✅ All fixes committed!");

        // Refresh materialized view
        console.log("Refreshing mv_Catalogue...");
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log("✅ mv_Catalogue refreshed");

        // Verify
        const verify = await pool.query(`
            SELECT i.productid, p.productname, i.quantityonhand, i.coliscount, i.palletcount
            FROM Inventory i
            JOIN Products p ON i.productid = p.productid
            WHERE i.productid IN (37, 4049)
        `);
        console.log("\n--- VERIFICATION ---");
        for (const row of verify.rows) {
            console.log(`  [${row.productid}] ${row.productname}: qty=${row.quantityonhand}, colis=${row.coliscount}, pallets=${row.palletcount}`);
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR:", e);
    } finally {
        client.release();
        pool.end();
    }
}

fixInventory();

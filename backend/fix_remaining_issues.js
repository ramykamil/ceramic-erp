require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const NEGATIVE_PRODUCTS = [
    "BERLIN BEIGE 45/45",
    "MAUREEN BLACK POLI REC 120/60"
];

const RECALC_PRODUCTS = [
    "BARCELONA OCRE 20/75", "ACRA BEIGE REC 60/60", "SWISS BEIGE REC 60/60",
    "ASCOT ROJO 20/75", "BERLIN BEIGE 45/45", "COSTA WHITE REC 60/60",
    "COTTO ROJO TERRE CUITE 45/45", "EUROPA MATT 45/90 DECO", "KING CREMA 45/90",
    "ROMA BLANC 30/90", "VICTORIA EXTRA REC 60/60", "STYLE 25/75",
    "PROSTYLE MARFIL 45/90", "MELINA MARFIL REC 60/60", "MIRNA EXTRA REC 60/60",
    "MAUREEN BLACK POLI REC 120/60", "DRAGON GREEN POLI REC 120/60",
    "ACRA GRIS 45/90", "EUROPA REC 60/60", "KING IVORY RELIEFE 45/90",
    "TECHNO CERAM_NEW_E985", "BIJOUX PERLA POLI REC 60/60", "CAIRO 33/33",
    "DRAGON POLI REC 120/60", "ROLEX GRIS POLI REC 60/60", "VENAS 45/45"
];

async function main() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // -------------------------------------------------------------
        // PART 1: FIX NEGATIVE QUANTITIES to 0
        // -------------------------------------------------------------
        console.log("--- 1. Flooring Negative Invetory ---");
        for (const name of NEGATIVE_PRODUCTS) {
            const res = await client.query('SELECT p.ProductID, p.ProductCode, p.ProductName, i.InventoryID, i.QuantityOnHand FROM Products p JOIN Inventory i ON p.ProductID = i.ProductID WHERE p.ProductName = $1', [name]);
            if (res.rows.length > 0) {
                const row = res.rows[0];
                const qty = parseFloat(row.quantityonhand);
                if (qty < 0) {
                    const diffToZero = Math.abs(qty); // The amount we need to add to reach 0

                    // Update to 0
                    await client.query('UPDATE Inventory SET QuantityOnHand = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE InventoryID = $1', [row.inventoryid]);

                    // Add Adjustment Record to balance ledger
                    await client.query(`
                        INSERT INTO InventoryTransactions (
                            ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, ReferenceID, Notes, CreatedBy
                        ) VALUES (
                            $1, 1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', NULL, 'Fix: Setting negative running total up to 0', 1
                        )
                    `, [row.productid, diffToZero]);

                    console.log(`[${row.productcode}] ${row.productname} floored from ${qty.toFixed(2)} to 0.00 (Created adjustment of +${diffToZero.toFixed(2)})`);
                } else {
                    console.log(`[${row.productcode}] ${row.productname} already at or above 0 (${qty.toFixed(2)})`);
                }
            }
        }

        // -------------------------------------------------------------
        // PART 2: RECALCULATE PACKAGING (Colis & Pallets) FOR ALL RESTORED
        // -------------------------------------------------------------
        console.log("\n--- 2. Recalculating Packaging ---");
        for (const name of RECALC_PRODUCTS) {
            const prodRes = await client.query(`
                SELECT p.ProductID, p.ProductCode, p.ProductName, p.QteParColis, p.QteColisParPalette, i.InventoryID, i.QuantityOnHand 
                FROM Products p
                JOIN Inventory i ON p.ProductID = i.ProductID
                WHERE p.ProductCode = $1 OR p.ProductName = $1
            `, [name]);

            if (prodRes.rows.length > 0) {
                const p = prodRes.rows[0];
                const totalQty = parseFloat(p.quantityonhand) || 0;
                const ppc = parseFloat(p.qteparcolis) || 0;     // QteParColis is usually SQM per Colis
                const cpp = parseFloat(p.qtecolisparpalette) || 0; // Colis per Palette

                let colisCount = 0;
                let palletCount = 0;

                if (ppc > 0) {
                    // Because QteParColis is usually already in the same metric (e.g., 1.44 sqm/colis for 60x60 tile sold in sqm)
                    colisCount = totalQty / ppc;
                }

                if (cpp > 0 && colisCount > 0) {
                    palletCount = colisCount / cpp;
                }

                // Update Inventory
                await client.query(`
                    UPDATE Inventory
                    SET ColisCount = $1, PalletCount = $2
                    WHERE InventoryID = $3
                `, [colisCount, palletCount, p.inventoryid]);

                if (colisCount > 0) {
                    console.log(`[${p.productcode}] Qty: ${totalQty.toFixed(2)} -> Colis: ${colisCount.toFixed(2)}, Pallets: ${palletCount.toFixed(2)}`);
                }
            }
        }

        await client.query('COMMIT');

        // Quick refresh of MV Catalog to sync UI instantly
        try {
            await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
            console.log('\nMV Catalogue Refreshed.');
        } catch (e) {
            // Ignore
        }

        console.log('\n✅ All fixes successfully applied.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ERROR:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

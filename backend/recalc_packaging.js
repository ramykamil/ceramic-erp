require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const TARGET_PRODUCTS = [
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

// parse size Helper (Same as order.controller)
function parseDimensions(str) {
    if (!str) return 0;
    const match = str.match(/(\d{2,3})\s*[xX*\/]\s*(\d{2,3})/);
    if (match) {
        return (parseInt(match[1]) * parseInt(match[2])) / 10000;
    }
    return 0;
}

// Calculate packing Helper
function calculatePacking(totalQtyStr, productDetails) {
    const totalQty = parseFloat(totalQtyStr) || 0;
    let palletCount = 0;
    let colisCount = 0;

    const qtyPerCarton = parseFloat(productDetails.qtypercarton) || 0;
    const cartonsPerPallet = parseFloat(productDetails.cartonsperpallet) || 0;

    if (qtyPerCarton > 0) {
        let isPrimarySqm = false;

        // Handle Unit
        if (productDetails.primaryunitid) {
            // Assume SQM/M2 if the unit is generally used for area
            // Ideally we'd join with Units table, but heuristically:
            // "M2", "SQM" etc. We'll simplify by strictly checking dimensions logic below
        }

        const sqmPerPiece = parseDimensions(productDetails.size || productDetails.productname);
        // check if fiche
        const isFiche = (productDetails.productname || '').toLowerCase().startsWith('fiche');

        if (sqmPerPiece > 0 && !isFiche) { // Usually implies sold in SQM but cartoning is pieces
            const totalPieces = totalQty / sqmPerPiece;
            colisCount = totalPieces / qtyPerCarton;
        } else {
            colisCount = totalQty / qtyPerCarton;
        }

        if (cartonsPerPallet > 0) {
            palletCount = colisCount / cartonsPerPallet;
        }
    }

    return { palletCount, colisCount };
}

async function main() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const name of TARGET_PRODUCTS) {
            const prodRes = await client.query(`
                SELECT p.*, u.UnitCode as "PrimaryUnitCode"
                FROM Products p
                LEFT JOIN Units u ON p.PrimaryUnitID = u.UnitID
                WHERE p.ProductCode = $1 OR UPPER(p.ProductName) = UPPER($1)
            `, [name]);

            if (prodRes.rows.length === 0) continue;
            const p = prodRes.rows[0];

            const invs = await client.query('SELECT * FROM Inventory WHERE ProductID = $1', [p.productid]);
            for (const inv of invs.rows) {
                const { palletCount, colisCount } = calculatePacking(inv.quantityonhand, {
                    qtypercarton: p.qtypercarton,
                    cartonsperpallet: p.cartonsperpallet,
                    size: p.size,
                    productname: p.productname,
                    primaryunitcode: p.PrimaryUnitCode
                });

                await client.query(`
                    UPDATE Inventory
                    SET PalletCount = $1, ColisCount = $2
                    WHERE InventoryID = $3
                `, [palletCount, colisCount, inv.inventoryid]);

                console.log(`[${p.productname}] Qty: ${parseFloat(inv.quantityonhand).toFixed(2)} -> Pallets: ${palletCount.toFixed(2)}, Colis: ${colisCount.toFixed(2)}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ Packaging counts updated successfully.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ERROR:', err);
    } finally {
        client.release();
        pool.end();
    }
}

main();

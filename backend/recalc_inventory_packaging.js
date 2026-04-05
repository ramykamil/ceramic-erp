/**
 * One-time script: Recalculate PalletCount and ColisCount for ALL inventory records
 * Runs against the CLOUD (Supabase) database
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

async function recalculate() {
    console.log('=== Recalculating PalletCount & ColisCount (CLOUD DB) ===\n');

    const client = await pool.connect();
    try {
        const result = await client.query(`
      SELECT 
        i.InventoryID, i.ProductID, i.QuantityOnHand,
        i.PalletCount as old_palletcount, i.ColisCount as old_coliscount,
        p.ProductName, p.QteParColis, p.QteColisParPalette
      FROM Inventory i
      JOIN Products p ON i.ProductID = p.ProductID
      WHERE i.QuantityOnHand > 0
      ORDER BY p.ProductName
    `);

        console.log(`Found ${result.rows.length} inventory records with stock > 0\n`);

        let updated = 0;
        let skipped = 0;

        await client.query('BEGIN');

        for (const row of result.rows) {
            const qty = parseFloat(row.quantityonhand) || 0;
            const ppc = parseFloat(row.qteparcolis) || 0;
            const cpp = parseFloat(row.qtecolisparpalette) || 0;

            const newColis = ppc > 0 ? parseFloat((qty / ppc).toFixed(4)) : 0;
            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

            const oldColis = parseFloat(row.old_coliscount) || 0;
            const oldPallets = parseFloat(row.old_palletcount) || 0;

            if (Math.abs(oldColis - newColis) > 0.01 || Math.abs(oldPallets - newPallets) > 0.01) {
                await client.query(
                    'UPDATE Inventory SET ColisCount = $1, PalletCount = $2 WHERE InventoryID = $3',
                    [newColis, newPallets, row.inventoryid]
                );
                console.log(`  FIX ${row.productname}`);
                console.log(`      Qty:${qty} Col:${oldColis}->${newColis} Pal:${oldPallets}->${newPallets}`);
                updated++;
            } else {
                skipped++;
            }
        }

        await client.query('COMMIT');

        console.log('\nRefreshing mv_Catalogue...');
        await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');

        console.log(`\n=== Done! Updated: ${updated} | Already correct: ${skipped} ===`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

recalculate();

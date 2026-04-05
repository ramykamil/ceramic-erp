const { Pool } = require('pg');
const pool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

(async () => {
    try {
        // Check ATLANTIC 60/60 in mv_Catalogue
        const mv = await pool.query(`
      SELECT ProductID, ProductName, TotalQty, NbPalette, NbColis, QteParColis, QteColisParPalette
      FROM mv_Catalogue 
      WHERE ProductName ILIKE '%ATLANTIC 60/60%'
    `);
        console.log('\n=== mv_Catalogue for ATLANTIC 60/60 ===');
        for (const r of mv.rows) {
            console.log(`  ID:${r.productid} | ${r.productname} | Qty:${r.totalqty} | Pal:${r.nbpalette} | Col:${r.nbcolis} | PPC:${r.qteparcolis} | CPP:${r.qtecolisparpalette}`);
        }

        // Check raw Inventory
        const inv = await pool.query(`
      SELECT i.InventoryID, i.ProductID, i.QuantityOnHand, i.PalletCount, i.ColisCount,
             p.ProductName, p.QteParColis, p.QteColisParPalette
      FROM Inventory i
      JOIN Products p ON i.ProductID = p.ProductID
      WHERE p.ProductName ILIKE '%ATLANTIC 60/60%'
    `);
        console.log('\n=== Inventory for ATLANTIC 60/60 ===');
        for (const r of inv.rows) {
            console.log(`  InvID:${r.inventoryid} | ${r.productname} | Qty:${r.quantityonhand} | Pal:${r.palletcount} | Col:${r.coliscount} | PPC:${r.qteparcolis} | CPP:${r.qtecolisparpalette}`);
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
})();

const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const DATABASE_URL = 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 15000,
});

async function runCorrection() {
    const client = await pool.connect();
    try {
        console.log('=== STARTING INVENTORY CORRECTION ===\n');
        await client.query('BEGIN');

        const corrections = [
            { productId: 3163, name: 'MARABELLA RELIEFE 30/90 (M²)', subtractQty: 1555.20 },
            { productId: 348, name: 'CALACATA POLI REC 120/60', subtractQty: 1814.40 }
        ];

        for (const target of corrections) {
            console.log(`\nProcessing: ${target.name} (ID: ${target.productId})`);
            
            // Get current inventory and product details
            const invQuery = await client.query(`
                SELECT i.InventoryID, i.QuantityOnHand, i.WarehouseID,
                       p.QteParColis, p.QteColisParPalette
                FROM Inventory i
                JOIN Products p ON i.ProductID = p.ProductID
                WHERE i.ProductID = $1 AND i.OwnershipType = 'OWNED' AND i.FactoryID IS NULL
            `, [target.productId]);

            if (invQuery.rows.length === 0) {
                console.log(`❌ Inventory not found for ${target.productId}`);
                continue;
            }

            // We assume there's mostly one main warehouse row, we'll take the first one (Warehouse 1 usually)
            const row = invQuery.rows.find(r => r.warehouseid == 1) || invQuery.rows[0];
            
            const currentQty = parseFloat(row.quantityonhand || 0);
            const newQty = currentQty - target.subtractQty;
            
            const ppc = parseFloat(row.qteparcolis || 0);
            const cpp = parseFloat(row.qtecolisparpalette || 0);
            
            const newColis = ppc > 0 ? parseFloat((newQty / ppc).toFixed(4)) : 0;
            const newPallets = cpp > 0 ? parseFloat((newColis / cpp).toFixed(4)) : 0;

            console.log(`  Current Qty: ${currentQty.toFixed(4)}`);
            console.log(`  Subtracting: ${target.subtractQty.toFixed(4)}`);
            console.log(`  New Qty:     ${newQty.toFixed(4)}`);
            console.log(`  New Colis:   ${newColis}`);
            console.log(`  New Pallets: ${newPallets}`);

            // Update inventory
            await client.query(`
                UPDATE Inventory 
                SET QuantityOnHand = $1, 
                    ColisCount = $2, 
                    PalletCount = $3,
                    UpdatedAt = CURRENT_TIMESTAMP
                WHERE InventoryID = $4
            `, [newQty, newColis, newPallets, row.inventoryid]);

            console.log(`  ✅ Inventory record updated.`);

            // Insert transaction record
            await client.query(`
                INSERT INTO InventoryTransactions 
                (ProductID, WarehouseID, TransactionType, Quantity, ReferenceType, OwnershipType, CreatedBy, Notes)
                VALUES ($1, $2, 'OUT', $3, 'ADJUSTMENT', 'OWNED', NULL, $4)
            `, [
                target.productId, 
                row.warehouseid, 
                target.subtractQty, 
                'Correction de stock fantôme PO #397 supprimé'
            ]);
            console.log(`  ✅ OUT transaction created in InventoryTransactions.`);
        }

        console.log('\n--- Refreshing mv_Catalogue... ---');
        await client.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed successfully.');

        await client.query('COMMIT');
        console.log('\n=== ALL CORRECTIONS APPLIED SUCCESSFULLY ===');
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error during correction, rolled back:', err);
    } finally {
        client.release();
        pool.end();
    }
}

runCorrection();

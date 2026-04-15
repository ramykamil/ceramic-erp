const { Pool, types } = require('pg');
types.setTypeParser(1082, function (v) { return v; });

const pool = new Pool({
    connectionString: 'postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7\'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000
});

async function investigateSweetNoble() {
    const client = await pool.connect();
    try {
        console.log('=================================================================');
        console.log('  INVESTIGATION: MOTIF SWEET/NOBLE GRIS 45/90');
        console.log('=================================================================\n');

        // 1. Find the exact product
        const pRes = await client.query(`
            SELECT ProductID, ProductName, QteParColis, QteColisParPalette
            FROM Products 
            WHERE ProductName ILIKE '%MOTIF SWEET/NOBLE GRIS 45/90%'
        `);

        if (pRes.rows.length === 0) {
            console.log('Product not found!');
            return;
        }

        const product = pRes.rows[0];
        console.log(`Product Found: ${product.productname} (ID: ${product.productid})`);
        console.log(`Packaging: ${product.qteparcolis} m²/colis, ${product.qtecolisparpalette} colis/palette\n`);

        // 2. Current Inventory
        const invRes = await client.query(`
            SELECT QuantityOnHand, PalletCount, ColisCount
            FROM Inventory
            WHERE ProductID = $1
        `, [product.productid]);

        console.log(`--- CURRENT INVENTORY TABLE ---`);
        for (const row of invRes.rows) {
            console.log(`  Qty: ${row.quantityonhand} | Palettes: ${row.palletcount} | Colis: ${row.coliscount}`);
        }
        console.log('');

        // 3. Complete Transaction History
        console.log(`--- TRANSACTION HISTORY (Chronological) ---`);
        const txRes = await client.query(`
            SELECT 
                it.TransactionID, it.CreatedAt, it.TransactionType, it.Quantity, 
                it.ReferenceType, it.ReferenceID, it.Notes, u.Username
            FROM InventoryTransactions it
            LEFT JOIN Users u ON it.CreatedBy = u.UserID
            WHERE it.ProductID = $1
            ORDER BY it.CreatedAt ASC
        `, [product.productid]);

        let runningQty = 0;
        let totalSales = 0;
        let totalPurchases = 0;
        let totalAdjIn = 0;
        let totalAdjOut = 0;

        for (const tx of txRes.rows) {
            const qty = parseFloat(tx.quantity || 0);
            const dateStr = tx.createdat ? new Date(tx.createdat).toISOString().replace('T', ' ').substring(0, 19) : 'Unknown Date';
            
            let changeStr = '';
            if (tx.transactiontype === 'IN' || tx.transactiontype === 'ADJUSTMENT' && qty > 0) {
                runningQty += qty;
                changeStr = `+${qty.toFixed(2)}`;
                if (tx.referencetype === 'GOODS_RECEIPT' || tx.referencetype === 'PURCHASE' || tx.referencetype === 'PURCHASE_UPDATE') totalPurchases += qty;
                else if (tx.referencetype === 'ADJUSTMENT') totalAdjIn += qty;
                else if (tx.referencetype === 'INITIAL_IMPORT') totalAdjIn += qty;
            } else if (tx.transactiontype === 'OUT' || tx.transactiontype === 'ADJUSTMENT' && qty < 0) {
                runningQty -= Math.abs(qty); // assuming OUT qty is positive in db
                changeStr = `-${Math.abs(qty).toFixed(2)}`;
                if (tx.referencetype === 'ORDER') totalSales += Math.abs(qty);
                else if (tx.referencetype === 'ADJUSTMENT') totalAdjOut += Math.abs(qty);
            }

            console.log(`  [${dateStr}] ${tx.transactiontype.padEnd(10)} | ${changeStr.padStart(8)} = ${runningQty.toFixed(2).padStart(8)} | Ref: ${String(tx.referencetype).padEnd(15)} #${tx.referenceid || '-'} | By: ${String(tx.username).padEnd(10)} | Notes: ${tx.notes || ''}`);
        }

        console.log(`\n--- SUMMARY OVER TIME ---`);
        console.log(`  Total Added via Purchases:     +${totalPurchases.toFixed(2)}`);
        console.log(`  Total Added via Adjustments:   +${totalAdjIn.toFixed(2)}`);
        console.log(`  Total Removed via Sales:       -${totalSales.toFixed(2)}`);
        console.log(`  Total Removed via Adjustments: -${totalAdjOut.toFixed(2)}`);
        console.log(`  -----------------------------------------`);
        console.log(`  Expected Final Qty:             ${runningQty.toFixed(2)}`);
        
    } catch (err) {
         console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

investigateSweetNoble();

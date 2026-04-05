const { Pool } = require('pg');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

// These are the amounts that were ADDED from the old products during the merge.
// We need to subtract them back to restore the newer product's original quantity.
const rollbacks = [
    { newId: 3717, oldQty: 3, oldPal: 0, oldCol: 0, name: 'FICHE:FLORA SILVER 30/90' },
    { newId: 3714, oldQty: 7.57, oldPal: 0, oldCol: 0, name: 'FICHE:KING CREMA 45/90' },
    { newId: 3716, oldQty: 0, oldPal: 0, oldCol: 0, name: 'FICHE:ROMA GRIS 25/75' },
    { newId: 3712, oldQty: 2.28, oldPal: 0, oldCol: 0, name: 'FICHE:SOFT BEIGE 60/60' },
    { newId: 3713, oldQty: 3.92, oldPal: 0, oldCol: 0, name: 'FICHE:VENAS PLUS 60/60' },
    { newId: 3852, oldQty: 225.435, oldPal: 0, oldCol: 0, name: 'KING IVORY RELIEFE 45/90' },
    { newId: 3711, oldQty: 0, oldPal: 0, oldCol: 0, name: 'MOTIF ROMA GRIS 25/75' },
    { newId: 3706, oldQty: 7165.44, oldPal: 0, oldCol: 0, name: 'VENAS PLUS 60/60' },
];

async function fix() {
    try {
        for (const r of rollbacks) {
            if (r.oldQty === 0) {
                console.log(`[${r.newId}] ${r.name} — no qty was added, skipping`);
                continue;
            }
            const before = await cloudPool.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1', [r.newId]);
            const currentQty = parseFloat(before.rows[0]?.quantityonhand || 0);
            const corrected = currentQty - r.oldQty;

            await cloudPool.query('UPDATE Inventory SET QuantityOnHand = $1 WHERE ProductID = $2', [corrected, r.newId]);
            console.log(`[${r.newId}] ${r.name} — ${currentQty} - ${r.oldQty} = ${corrected}`);
        }

        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('\n✅ Quantities restored to newer product values. mv_Catalogue refreshed.');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        cloudPool.end();
    }
}

fix();

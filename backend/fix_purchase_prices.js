const { Pool } = require('pg');

const cloudPool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

const fixes = [
    { id: 3756, name: 'FICHE:EXTRA BEIGE REC 60/60', price: 4000 },
    { id: 3757, name: 'FICHE:EXTRA GRIS REC 60/60', price: 4000 },
    { id: 3593, name: 'FICHE:VOGUE 45/45', price: 4000 },
    { id: 3455, name: 'TORA MARRON 60/60', price: 920 },
    { id: 1723, name: 'TRANSPORT ABD RAHMAN DJELFA', price: 38000 },
    { id: 1111, name: 'TRANSPORT ADLANE KHENCHLA 6*4', price: 20000 },
    { id: 3663, name: 'TRANSPORT BEIT NAKHIL', price: 40000 },
    { id: 1147, name: 'TRANSPORT BOUBAKER AIN MLILA', price: 40000 }
];

async function fixPurchasePrices() {
    try {
        let count = 0;
        for (const f of fixes) {
            console.log(`Updating [${f.id}] ${f.name} -> PurchasePrice: ${f.price}`);
            await cloudPool.query('UPDATE Products SET PurchasePrice = $1 WHERE ProductID = $2', [f.price, f.id]);
            count++;
        }

        console.log(`\n✅ ${count} purchase prices updated.`);
        console.log('Refreshing mv_Catalogue...');
        await cloudPool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
        console.log('✅ mv_Catalogue refreshed.');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        cloudPool.end();
    }
}

fixPurchasePrices();

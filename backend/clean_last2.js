const { Pool } = require('pg');
const pool = new Pool({
    connectionString: "postgresql://postgres.ugvioyruqoafvsqvnwiy:%22p3yf%2BXV7'EMz%5E%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function go() {
    const client = await pool.connect();
    const pairs = [
        { keepId: 3418, oldId: 3384, label: 'MONOCOUCHE 0.8/0-8' },
        { keepId: 3425, oldId: 3391, label: 'MONOCOUCHE 11B/11 B' }
    ];
    const tables = ['OrderItems', 'PurchaseOrderItems', 'InventoryTransactions', 'GoodsReceiptItems', 'BuyingPrices', 'CustomerProductPrices', 'PriceListItems'];

    await client.query('BEGIN');
    for (const p of pairs) {
        console.log(`Keeping [${p.keepId}] | Deactivating [${p.oldId}] ${p.label}`);

        const sales = await client.query(
            `SELECT COALESCE(SUM(oi.Quantity),0) as s FROM OrderItems oi JOIN Orders o ON oi.OrderID=o.OrderID WHERE oi.ProductID=$1 AND o.Status != 'CANCELLED'`, [p.oldId]
        );
        const purch = await client.query(
            `SELECT COALESCE(SUM(poi.Quantity),0) as s FROM PurchaseOrderItems poi JOIN PurchaseOrders po ON poi.PurchaseOrderID=po.PurchaseOrderID WHERE poi.ProductID=$1 AND po.Status != 'CANCELLED'`, [p.oldId]
        );
        const sold = parseFloat(sales.rows[0].s);
        const purchased = parseFloat(purch.rows[0].s);
        const netAdj = purchased - sold;
        if (sold > 0 || purchased > 0) console.log(`  Old sold=${sold} purchased=${purchased} net=${netAdj}`);

        for (const t of tables) {
            const r = await client.query(`SELECT COUNT(*) as c FROM ${t} WHERE ProductID=$1`, [p.oldId]);
            if (parseInt(r.rows[0].c) > 0) {
                console.log(`  Reassigning ${r.rows[0].c} ${t}`);
                await client.query(`UPDATE ${t} SET ProductID=$1 WHERE ProductID=$2`, [p.keepId, p.oldId]);
            }
        }

        if (Math.abs(netAdj) > 0.001) {
            await client.query('UPDATE Inventory SET QuantityOnHand=QuantityOnHand+$1 WHERE ProductID=$2', [netAdj, p.keepId]);
            console.log(`  Inventory adjusted: ${netAdj}`);
        }

        await client.query('DELETE FROM Inventory WHERE ProductID=$1', [p.oldId]);
        await client.query('UPDATE Products SET IsActive=false, UpdatedAt=CURRENT_TIMESTAMP WHERE ProductID=$1', [p.oldId]);

        const inv = await client.query('SELECT QuantityOnHand FROM Inventory WHERE ProductID=$1', [p.keepId]);
        console.log(`  Final qty: ${inv.rows.length ? inv.rows[0].quantityonhand : 0}\n`);
    }
    await client.query('COMMIT');
    console.log('COMMITTED');
    await pool.query('REFRESH MATERIALIZED VIEW mv_Catalogue');
    console.log('mv_Catalogue refreshed');
    client.release();
    pool.end();
}
go().catch(e => { console.error(e); process.exit(1); });

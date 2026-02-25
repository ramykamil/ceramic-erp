const pool = require('./src/config/database');

async function testQuery() {
    try {
        const query = `
            SELECT 
                po.purchaseorderid,
                po.ponumber,
                p.productname,
                poi.quantity,
                u.unitcode
            FROM public.purchaseorders po
            JOIN public.purchaseorderitems poi ON po.purchaseorderid = poi.purchaseorderid
            JOIN public.products p ON poi.productid = p.productid
            JOIN public.units u ON poi.unitid = u.unitid
            WHERE p.productname LIKE '%FICHE:%' OR p.productname LIKE '%ALMERIA%'
            ORDER BY po.purchaseorderid DESC
            LIMIT 10;
        `;
        const res = await pool.query(query);
        console.table(res.rows);
    } catch (err) {
        console.error('Error executing query', err.stack);
    } finally {
        pool.end();
    }
}

testQuery();

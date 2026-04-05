require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
    const c = await pool.connect();
    try {
        // GoodsReceipts schema
        const grSchema = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'goodsreceipts' ORDER BY ordinal_position`);
        console.log('GoodsReceipts columns:', grSchema.rows.map(r => r.column_name).join(', '));

        // PurchaseOrders schema
        const poSchema = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'purchaseorders' ORDER BY ordinal_position`);
        console.log('PurchaseOrders columns:', poSchema.rows.map(r => r.column_name).join(', '));

        // Find GR with receiptid 124
        const gr = await c.query(`SELECT * FROM GoodsReceipts WHERE receiptid = 124`);
        console.log('\nGR 124:', JSON.stringify(gr.rows, null, 2));

        // Find items for GR 124
        const items = await c.query(`
            SELECT gri.*, p.productname, p.size, u.unitcode
            FROM GoodsReceiptItems gri
            JOIN Products p ON gri.productid = p.productid
            LEFT JOIN Units u ON gri.unitid = u.unitid
            WHERE gri.receiptid = 124
            ORDER BY gri.receiptitemid
        `);
        console.log(`\nGR 124 items (${items.rows.length}):`);
        for (const i of items.rows) {
            console.log(`  Product ${i.productid} ${i.productname}: received=${i.quantityreceived} unit=${i.unitcode}`);
        }

        // Check the PO that this GR is for
        if (gr.rows.length > 0) {
            const poId = gr.rows[0].purchaseorderid || gr.rows[0].poid;
            console.log(`\nPurchase Order ID: ${poId}`);
            if (poId) {
                const po = await c.query(`SELECT * FROM PurchaseOrders WHERE purchaseorderid = $1`, [poId]);
                console.log('PO:', JSON.stringify(po.rows[0], null, 2));

                // PO Items
                const poItems = await c.query(`
                    SELECT poi.*, p.productname, u.unitcode
                    FROM PurchaseOrderItems poi
                    JOIN Products p ON poi.productid = p.productid
                    LEFT JOIN Units u ON poi.unitid = u.unitid
                    WHERE poi.purchaseorderid = $1
                `, [poId]);
                console.log(`\nPO items (${poItems.rows.length}):`);
                for (const i of poItems.rows) {
                    console.log(`  Product ${i.productid} ${i.productname}: qty=${i.quantity} unit=${i.unitcode}`);
                }
            }
        }

        // Check ALL recent GRs (today)
        console.log('\n\n=== ALL GRs from today ===');
        const todayGRs = await c.query(`SELECT * FROM GoodsReceipts WHERE createdat > '2026-03-05' ORDER BY createdat DESC`);
        for (const g of todayGRs.rows) {
            console.log(`  ${JSON.stringify(g)}`);
        }

        // Check the createPurchaseOrder code to see how GR works
        // Let's check what the IN transaction qty matches
        console.log('\n=== COLMAR BEIGE: Inventory transaction vs GR item ===');
        const colmarGRI = await c.query(`SELECT * FROM GoodsReceiptItems WHERE productid = 435`);
        console.log('GR items for COLMAR:', JSON.stringify(colmarGRI.rows, null, 2));

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        c.release();
        pool.end();
    }
})();

const pool = require('./src/config/database');

async function checkProduct() {
    try {
        const query = "SELECT * FROM Products WHERE ProductName = 'ENERGIE REC 120/60 (2éme)'";
        const res = await pool.query(query);

        if (res.rows.length === 0) {
            console.log('Product not found');
        } else {
            const p = res.rows[0];
            console.log('Product Details:', {
                id: p.productid,
                code: p.productcode,
                name: p.productname,
                purchasePrice: p.purchaseprice,
                basePrice: p.baseprice
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkProduct();

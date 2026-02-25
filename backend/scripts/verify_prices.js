const path = require('path');
let pool;
try {
    pool = require('../src/config/database');
} catch (e) {
    console.log('Could not load ../src/config/database, trying ../src/db');
    pool = require('../src/db');
}

async function verifyPrices() {
    console.log('Verifying prices...');
    const client = await pool.connect();
    try {
        // Check a few products that were supposed to be updated
        // From dry run: "LUKE PERLA TERRE CUITE 45/45" -> 790

        const productName = "LUKE PERLA TERRE CUITE 45/45";

        console.log(`Checking product: "${productName}"`);

        const productRes = await client.query('SELECT ProductID, ProductName, PurchasePrice FROM Products WHERE ProductName = $1', [productName]);
        if (productRes.rows.length > 0) {
            console.log('Table Products:', productRes.rows[0]);
        } else {
            console.log('Product not found in Products table');
        }

        const viewRes = await client.query('SELECT ProductID, ProductName, PrixAchat FROM mv_Catalogue WHERE ProductName = $1', [productName]);
        if (viewRes.rows.length > 0) {
            console.log('View mv_Catalogue:', viewRes.rows[0]);
        } else {
            console.log('Product not found in mv_Catalogue');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyPrices();

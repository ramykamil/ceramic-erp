require('dotenv').config();
const pool = require('./src/config/database');
const httpMocks = require('node-mocks-http');
const orderController = require('./src/api/v1/controllers/order.controller');

async function run() {
    try {
        console.log('Testing atomic order creation...');

        // 1. Find the product ARIZONA PERLA REC 20/75
        const prodRes = await pool.query("SELECT * FROM Products WHERE ProductName ILIKE '%ARIZONA%' AND ProductName NOT ILIKE '%FICHE%' LIMIT 1");
        if (!prodRes.rows.length) {
            console.log("Product not found. Exiting test.");
            return process.exit(0);
        }
        const product = prodRes.rows[0];
        console.log('Found product:', product.productname);

        // Get unit SQM
        const unitRes = await pool.query("SELECT UnitID FROM Units WHERE UnitCode = 'SQM'");
        const sqmUnitId = unitRes.rows[0].unitid;

        // Build mock req/res
        const req = httpMocks.createRequest({
            method: 'POST',
            url: '/api/v1/orders',
            user: { userId: 1, role: 'ADMIN' },
            body: {
                customerId: null,
                orderType: 'RETAIL',
                warehouseId: 1,
                retailClientName: 'Test Atomic Order',
                items: [
                    {
                        productId: product.productid,
                        quantity: 103.68, // The requested quantity in SQM
                        unitId: sqmUnitId,
                        unitPrice: 1500
                    }
                ]
            }
        });

        const res = httpMocks.createResponse();

        // Catch next() errors
        const next = (err) => {
            console.error('Error in next():', err.message);
        };

        console.log('Calling createOrder endpoint...');
        await orderController.createOrder(req, res, next);

        // Wait for async operations if any (though createOrder should await everything)
        const data = res._getJSONData();
        console.log('Response status:', res.statusCode);
        console.log('Response body:', data);

        if (res.statusCode === 201) {
            console.log('Deleting test order...');
            await pool.query('DELETE FROM Orders WHERE OrderID = $1', [data.data.orderid]);
        }

    } catch (err) {
        console.error('Fatal test error:', err);
    } finally {
        process.exit(0);
    }
}
run();

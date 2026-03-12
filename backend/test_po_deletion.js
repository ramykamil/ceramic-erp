const pool = require('./src/config/database');
const poController = require('./src/api/v1/controllers/purchaseOrder.controller');

async function runTest() {
    console.log("--- Starting PO Deletion Test ---");
    let testPoId = null;

    try {
        // Mock res object
        const mockRes = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { this.data = data; }
        };

        const mockNext = (err) => { throw err; };

        // 1. Get a product to test with
        const productRes = await pool.query("SELECT ProductID, PrimaryUnitID FROM Products WHERE IsActive = TRUE AND BasePrice > 0 LIMIT 1");
        if (productRes.rows.length === 0) throw new Error("No active product found.");
        const product = productRes.rows[0];

        // 2. Get a warehouse
        const warehouseRes = await pool.query("SELECT WarehouseID FROM Warehouses WHERE IsActive = TRUE LIMIT 1");
        if (warehouseRes.rows.length === 0) throw new Error("No active warehouse found.");
        const warehouseId = warehouseRes.rows[0].warehouseid;

        // 2b. Get a factory
        let factoryRes = await pool.query("SELECT FactoryID FROM Factories WHERE IsActive = TRUE LIMIT 1");
        let factoryId;
        if (factoryRes.rows.length === 0) {
            console.log("No active factory found, creating a dummy one.");
            const insertFactory = await pool.query("INSERT INTO Factories (FactoryCode, FactoryName, IsActive) VALUES ($1, $2, TRUE) RETURNING FactoryID", ['TEST-FAC', 'Test Factory']);
            factoryId = insertFactory.rows[0].factoryid;
        } else {
            factoryId = factoryRes.rows[0].factoryid;
        }

        // 3. Get initial inventory
        const initialInv = await pool.query("SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' AND FactoryID IS NULL", [product.productid, warehouseId]);
        const initialQty = initialInv.rows.length > 0 ? parseFloat(initialInv.rows[0].quantityonhand) : 0;
        console.log(`Initial Inventory Qty: ${initialQty}`);

        // 4. Create PO (PENDING)
        const createReq = {
            body: {
                supplierId: factoryId, // Fallback, doesn't matter much for this test
                supplierType: 'FACTORY',
                warehouseId: warehouseId,
                orderDate: new Date().toISOString().split('T')[0],
                ownershipType: 'OWNED',
                deliveryCost: 0,
                items: [
                    { productId: product.productid, quantity: 50, unitId: 1, unitPrice: 10 }
                ]
            },
            user: { userId: 1, role: 'ADMIN' }
        };

        await poController.createPurchaseOrder(createReq, mockRes, mockNext);
        if (!mockRes.data || !mockRes.data.success) {
            console.error("Create PO failed:", mockRes.data);
            return;
        }
        testPoId = mockRes.data.data.purchaseOrderId;
        console.log(`PO Created: ${testPoId}`);

        // 5. Update PO to RECEIVED (This should increase inventory directly)
        const updateReq = {
            params: { id: testPoId },
            body: {
                supplierId: 1,
                supplierType: 'FACTORY',
                warehouseId: warehouseId,
                orderDate: new Date().toISOString().split('T')[0],
                ownershipType: 'OWNED',
                items: [
                    { productId: product.productid, quantity: 50, unitId: product.primaryunitid, unitPrice: 10 }
                ]
            },
            user: { userId: 1, role: 'ADMIN' }
        };

        // First manually update status to received to trigger the "RECEIVED/PARTIAL" logic in update logic?
        // Wait, updatePurchaseOrder doesn't *set* the status to RECEIVED inside the controller based on payload status. 
        // It updates the items. But the goods receipt controller sets the status.
        // Actually, if we just want to test deletion of a PO with status RECEIVED that has NO Goods Receipt...
        await pool.query("UPDATE PurchaseOrders SET Status = 'RECEIVED' WHERE PurchaseOrderID = $1", [testPoId]);
        
        // Manually add inventory as if updatePurchaseOrder/GoodsReceipt did it (since updatePurchaseOrder does diff logic for RECEIVED POs, if we update it it will try to diff against old PENDING).
        // Let's just directly add 50 to inventory to simulate.
        await pool.query(`
            UPDATE Inventory SET QuantityOnHand = QuantityOnHand + 50 
            WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' AND FactoryID IS NULL
        `, [product.productid, warehouseId]);

        const midInv = await pool.query("SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' AND FactoryID IS NULL", [product.productid, warehouseId]);
        const midQty = midInv.rows.length > 0 ? parseFloat(midInv.rows[0].quantityonhand) : 0;
        console.log(`Mid Inventory Qty (after RECIEVED simulation): ${midQty}`);

        // 6. Delete PO
        const deleteReq = {
            params: { id: testPoId },
            user: { userId: 1, role: 'ADMIN' }
        };
        await poController.deletePurchaseOrder(deleteReq, mockRes, mockNext);
        console.log(`Delete Response:`, mockRes.data);

        // 7. Verify Inventory
        const finalInv = await pool.query("SELECT QuantityOnHand FROM Inventory WHERE ProductID = $1 AND WarehouseID = $2 AND OwnershipType = 'OWNED' AND FactoryID IS NULL", [product.productid, warehouseId]);
        const finalQty = finalInv.rows.length > 0 ? parseFloat(finalInv.rows[0].quantityonhand) : 0;
        console.log(`Final Inventory Qty: ${finalQty}`);

        if (finalQty === initialQty) {
            console.log("SUCCESS: Inventory reverted correctly.");
        } else {
            console.error("FAILED: Inventory did not revert properly.");
        }

    } catch (e) {
        console.error("Test error:", e);
    } finally {
        if (testPoId) {
            // cleanup if needed (although deletePurchaseOrder should have deleted it)
            await pool.query("DELETE FROM PurchaseOrderItems WHERE PurchaseOrderID = $1", [testPoId]);
            await pool.query("DELETE FROM PurchaseOrders WHERE PurchaseOrderID = $1", [testPoId]);
        }
        await pool.end();
    }
}

runTest();

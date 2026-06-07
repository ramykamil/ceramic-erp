const pool = require('./src/config/database');
pool.query("UPDATE Products SET PrimaryUnitID = 3 WHERE ProductID = 3539")
    .then(() => {
        console.log('Fixed ARIZONA PERLA 20/75 PrimaryUnitID to 3 (SQM)');
        return pool.query("UPDATE Inventory SET QuantityOnHand = 150.0 WHERE ProductID = 3539 AND WarehouseID = 1 AND OwnershipType = 'OWNED' AND QuantityOnHand = 150.0"); // Keep it as 150 SQM
    })
    .then(() => {
        console.log('Inventory for 3539 validated to be SQM base');
        pool.end();
    });

const pool = require('../../../config/database');

// --- Vehicles ---

/**
 * Get active vehicles
 */
async function getVehicles(req, res, next) {
    try {
        const result = await pool.query("SELECT VehicleID, VehicleNumber, VehicleType, Make, Model FROM Vehicles WHERE IsActive = TRUE ORDER BY VehicleNumber");
        res.json({ success: true, data: result.rows });
    } catch (error) {
        next(error);
    }
}

/**
 * Create a new Vehicle
 */
async function createVehicle(req, res, next) {
    try {
        const { vehicleNumber, vehicleType, make, model, capacity } = req.body;
        const result = await pool.query(
            `INSERT INTO Vehicles (VehicleNumber, VehicleType, Make, Model, Capacity, IsActive) 
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
            [vehicleNumber, vehicleType, make, model, capacity || 0]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { next(error); }
}

async function updateVehicle(req, res, next) {
    try {
        const { id } = req.params;
        const { vehicleNumber, registrationNumber, vehicleType, make, model, capacity } = req.body;
        const query = `
      UPDATE Vehicles
      SET VehicleNumber = $1, RegistrationNumber = $2, VehicleType = $3, Make = $4, Model = $5, Capacity = $6
      WHERE VehicleID = $7
      RETURNING *
    `;
        const result = await pool.query(query, [vehicleNumber, registrationNumber, vehicleType, make, model, capacity, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
}

async function deleteVehicle(req, res, next) {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM Vehicles WHERE VehicleID = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        res.json({ success: true, message: 'Vehicle deleted successfully' });
    } catch (error) {
        next(error);
    }
}

// --- Drivers ---

/**
 * Get active drivers (Joined with Employees to get names)
 */
async function getDrivers(req, res, next) {
    try {
        const query = `
      SELECT 
        d.DriverID, 
        e.FirstName, 
        e.LastName, 
        d.LicenseNumber 
      FROM Drivers d
      JOIN Employees e ON d.EmployeeID = e.EmployeeID
      WHERE d.IsActive = TRUE 
      ORDER BY e.FirstName
    `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error) { next(error); }
}

/**
 * Create a new Driver (Promote Employee)
 */
async function createDriver(req, res, next) {
    try {
        const { employeeId, licenseNumber, licenseExpiry } = req.body;
        const result = await pool.query(
            `INSERT INTO Drivers (EmployeeID, LicenseNumber, LicenseExpiryDate, IsActive) 
       VALUES ($1, $2, $3, TRUE) RETURNING *`,
            [employeeId, licenseNumber, licenseExpiry || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { next(error); }
}

/**
 * Get Employees who are NOT yet drivers (for dropdown)
 */
async function getPotentialDrivers(req, res, next) {
    try {
        const result = await pool.query(`
        SELECT e.EmployeeID, e.FirstName, e.LastName 
        FROM Employees e 
        LEFT JOIN Drivers d ON e.EmployeeID = d.EmployeeID 
        WHERE d.DriverID IS NULL AND e.IsActive = TRUE
        ORDER BY e.FirstName
    `);
        res.json({ success: true, data: result.rows });
    } catch (error) { next(error); }
}

async function updateDriver(req, res, next) {
    try {
        const { id } = req.params;
        const { employeeId, licenseNumber, phone } = req.body;
        const query = `
      UPDATE Drivers
      SET EmployeeID = $1, LicenseNumber = $2, Phone = $3
      WHERE DriverID = $4
      RETURNING *
    `;
        const result = await pool.query(query, [employeeId, licenseNumber, phone, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
}

async function deleteDriver(req, res, next) {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM Drivers WHERE DriverID = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        res.json({ success: true, message: 'Driver deleted successfully' });
    } catch (error) {
        next(error);
    }
}

// --- Deliveries ---

async function getDeliveries(req, res, next) {
    try {
        const query = `
      SELECT 
        d.*,
        o.OrderNumber,
        v.RegistrationNumber,
        v.VehicleNumber,
        v.Model as VehicleModel,
        e.FirstName as DriverFirstName,
        e.LastName as DriverLastName
      FROM Deliveries d
      JOIN Orders o ON d.OrderID = o.OrderID
      LEFT JOIN Vehicles v ON d.VehicleID = v.VehicleID
      LEFT JOIN Drivers dr ON d.DriverID = dr.DriverID
      LEFT JOIN Employees e ON dr.EmployeeID = e.EmployeeID
      ORDER BY d.DeliveryDate DESC
    `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        next(error);
    }
}

/**
 * Create a new delivery
 */
async function createDelivery(req, res, next) {
    const { orderId, driverId, vehicleId, deliveryDate, destination, notes } = req.body;
    const userId = req.user.userId;

    if (!orderId || !driverId || !vehicleId || !deliveryDate) {
        return res.status(400).json({ success: false, message: 'Champs requis manquants.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create Delivery Record
        // Generate Delivery Number (Simple sequence or timestamp logic)
        const delNumRes = await client.query("SELECT 'DEL-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(NEXTVAL('orders_seq')::TEXT, 4, '0') as num"); // Reusing order seq for simplicity or create new
        const deliveryNumber = delNumRes.rows[0].num;

        const insertQuery = `
      INSERT INTO Deliveries (DeliveryNumber, OrderID, VehicleID, DriverID, DeliveryDate, Destination, Notes, CreatedBy, Status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED')
      RETURNING DeliveryID;
    `;
        await client.query(insertQuery, [deliveryNumber, orderId, vehicleId, driverId, deliveryDate, destination, notes, userId]);

        // 2. Update Order Status to 'SHIPPED' (Optional, but logical)
        await client.query("UPDATE Orders SET Status = 'SHIPPED' WHERE OrderID = $1", [orderId]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Livraison planifiée avec succès.' });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
}

async function updateDeliveryStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const query = `
      UPDATE Deliveries
      SET Status = $1, UpdatedAt = CURRENT_TIMESTAMP
      WHERE DeliveryID = $2
      RETURNING *
    `;
        const result = await pool.query(query, [status, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Delivery not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle,
    getDrivers,
    createDriver,
    updateDriver,
    deleteDriver,
    getDeliveries,
    createDelivery,
    updateDeliveryStatus,
    getPotentialDrivers
};


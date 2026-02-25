const pool = require('../../../config/database');

const clockIn = async (req, res) => {
    const { employeeId } = req.body;

    if (!employeeId) {
        return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    try {
        // Check if already clocked in today without clock out
        const existing = await pool.query(
            `SELECT * FROM Attendance 
             WHERE EmployeeID = $1 AND AttendanceDate = CURRENT_DATE AND CheckOutTime IS NULL`,
            [employeeId]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Already clocked in' });
        }

        const result = await pool.query(
            `INSERT INTO Attendance (EmployeeID, CheckInTime, AttendanceDate, Status)
             VALUES ($1, CURRENT_TIME, CURRENT_DATE, 'PRESENT')
             RETURNING *`,
            [employeeId]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error clocking in:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const clockOut = async (req, res) => {
    const { employeeId } = req.body;

    if (!employeeId) {
        return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    try {
        const result = await pool.query(
            `UPDATE Attendance 
             SET CheckOutTime = CURRENT_TIME
             WHERE EmployeeID = $1 AND AttendanceDate = CURRENT_DATE AND CheckOutTime IS NULL
             RETURNING *`,
            [employeeId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Not clocked in' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error clocking out:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getAttendanceHistory = async (req, res) => {
    const { employeeId, startDate, endDate } = req.query;
    let query = `
        SELECT 
            a.AttendanceID,
            a.EmployeeID,
            a.AttendanceDate as date,
            a.CheckInTime,
            a.CheckOutTime,
            a.Status,
            e.FirstName,
            e.LastName
        FROM Attendance a
        JOIN Employees e ON a.EmployeeID = e.EmployeeID
        WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (employeeId) {
        query += ` AND a.EmployeeID = $${paramCount}`;
        params.push(employeeId);
        paramCount++;
    }

    if (startDate) {
        query += ` AND a.AttendanceDate >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        query += ` AND a.AttendanceDate <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    query += ` ORDER BY a.AttendanceDate DESC, a.CheckInTime DESC LIMIT 100`;

    try {
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching attendance:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    clockIn,
    clockOut,
    getAttendanceHistory
};


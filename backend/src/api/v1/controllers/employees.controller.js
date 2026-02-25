const pool = require('../../../config/database');

const getEmployees = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Employees ORDER BY LastName, FirstName');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getEmployeeById = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM Employees WHERE EmployeeID = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const createEmployee = async (req, res) => {
    const { EmployeeCode, FirstName, LastName, Position, Department, Email, BasicSalary } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO Employees (EmployeeCode, FirstName, LastName, Position, Department, Email, BasicSalary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
            [EmployeeCode, FirstName, LastName, Position, Department, Email, BasicSalary]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error creating employee:', error);
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ success: false, message: 'Employee code or email already exists' });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { FirstName, LastName, Position, Department, Email, BasicSalary } = req.body;
    try {
        const result = await pool.query(
            `UPDATE Employees 
       SET FirstName = $1, LastName = $2, Position = $3, Department = $4, Email = $5, BasicSalary = $6
       WHERE EmployeeID = $7
       RETURNING *`,
            [FirstName, LastName, Position, Department, Email, BasicSalary, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    getEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee
};

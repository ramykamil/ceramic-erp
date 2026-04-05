const pool = require('../../../config/database');

async function getAuditLogs(req, res, next) {
    try {
        const { page = 1, limit = 50, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
      SELECT 
        a.*,
        u.Username,
        u.Role
      FROM AuditLogs a
      LEFT JOIN Users u ON a.UserID = u.UserID
      WHERE 1=1
    `;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (a.Action ILIKE $${paramIndex} OR u.Username ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY a.CreatedAt DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Count total for pagination
        const countQuery = `SELECT COUNT(*) FROM AuditLogs`;
        const countResult = await pool.query(countQuery);

        res.json({
            success: true,
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getAuditLogs
};

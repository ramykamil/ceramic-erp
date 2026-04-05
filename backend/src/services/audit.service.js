const pool = require('../config/database');

const auditService = {
    /**
     * Log an action to the database
     * @param {number} userId - ID of the user performing the action
     * @param {string} action - Description of the action (e.g., 'CREATE_CUSTOMER')
     * @param {string} tableName - Affected table (optional)
     * @param {number} recordId - ID of the affected record (optional)
     * @param {object} oldValues - Previous state (optional)
     * @param {object} newValues - New state (optional)
     * @param {string} ipAddress - IP Address of the user (optional)
     * @param {string} userAgent - User Agent string (optional)
     */
    log: async (userId, action, tableName = null, recordId = null, oldValues = null, newValues = null, ipAddress = null, userAgent = null) => {
        try {
            const query = `
        INSERT INTO AuditLogs (UserID, Action, TableName, RecordID, OldValues, NewValues, IPAddress, UserAgent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
            await pool.query(query, [
                userId,
                action,
                tableName,
                recordId,
                oldValues ? JSON.stringify(oldValues) : null,
                newValues ? JSON.stringify(newValues) : null,
                ipAddress,
                userAgent
            ]);
        } catch (error) {
            console.error('Audit Log Error:', error);
            // We don't throw here to avoid failing the main transaction if logging fails, 
            // but in strict compliance environments, you might want to throw.
        }
    }
};

module.exports = auditService;

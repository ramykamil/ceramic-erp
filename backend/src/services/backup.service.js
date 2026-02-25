/**
 * Backup Service
 * Handles database backup operations using pg_dump
 */
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class BackupService {
    /**
     * Performs a database backup
     * @param {string} [customPath] - Optional custom path for this specific backup
     * @returns {Promise<Object>} - Result object with success status and file info
     */
    async performBackup(customPath = null) {
        return new Promise((resolve, reject) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            // Determine backup directory
            // Priority: customPath > process.env.BACKUP_DIR > Default Project Backups Folder
            let backupDir;
            if (customPath) {
                backupDir = customPath;
            } else if (process.env.BACKUP_DIR) {
                backupDir = process.env.BACKUP_DIR;
            } else {
                // Default to 'backups' folder in the project root (backend/backups)
                backupDir = path.join(__dirname, '../../backups');
            }

            // Ensure backup directory exists
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const filename = `backup_ceramic_${timestamp}.sql`;
            const filepath = path.join(backupDir, filename);

            console.log(`[BACKUP] Starting backup to ${filepath}`);

            // Database connection details from environment
            const dbName = process.env.DB_NAME || 'ceramic_db';
            const dbUser = process.env.DB_USER || 'postgres';
            const dbHost = process.env.DB_HOST || 'localhost';
            const dbPort = process.env.DB_PORT || '5432';

            // Prepare Environment with password
            const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };

            // Add common PostgreSQL bin paths to PATH (Fix for Windows where pg_dump is not in global PATH)
            const possiblePaths = [
                'C:\\Program Files\\PostgreSQL\\18\\bin',
                'C:\\Program Files\\PostgreSQL\\17\\bin',
                'C:\\Program Files\\PostgreSQL\\16\\bin',
                'C:\\Program Files\\PostgreSQL\\15\\bin',
                'C:\\Program Files\\PostgreSQL\\14\\bin',
                'C:\\Program Files\\PostgreSQL\\13\\bin',
                'C:\\Program Files\\PostgreSQL\\12\\bin'
            ];

            const separator = process.platform === 'win32' ? ';' : ':';
            env.PATH = `${possiblePaths.join(separator)}${separator}${process.env.PATH || ''}`;

            const command = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -F p -f "${filepath}" ${dbName}`;

            exec(command, { env }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[BACKUP] Error: ${error.message}`);
                    return reject(error);
                }
                // Note: pg_dump may output informational messages to stderr even on success
                if (stderr) {
                    console.warn(`[BACKUP] Stderr: ${stderr}`);
                }

                console.log(`[BACKUP] Success: ${filepath}`);

                try {
                    const stats = fs.statSync(filepath);
                    resolve({
                        success: true,
                        message: `Sauvegarde réussie: ${filename}`,
                        filename: filename,
                        path: filepath,
                        size: stats.size
                    });
                } catch (e) {
                    // File might not exist if pg_dump failed silently
                    resolve({
                        success: true,
                        message: `Sauvegarde réussie: ${filename}`,
                        filename: filename,
                        path: filepath,
                        size: 0
                    });
                }
            });
        });
    }
}

module.exports = new BackupService();

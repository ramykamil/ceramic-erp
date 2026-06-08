/**
 * Scheduler Service
 * Handles scheduled tasks like automatic daily backups
 */
const cron = require('node-cron');
const backupService = require('./backup.service');
const pool = require('../config/database');

class SchedulerService {
    /**
     * Initialize all scheduled jobs
     * Call this once when the server starts
     */
    init() {
        this.initBackupSchedule();
        this.initSubscriptionExpiryCheck();
    }

    /**
     * Initialize the automatic backup schedule
     * Default: Daily at midnight (00:00)
     * Configurable via BACKUP_SCHEDULE environment variable (cron format)
     */
    initBackupSchedule() {
        // Cron format: minute hour day-of-month month day-of-week
        // '0 0 * * *' = Every day at midnight
        // '0 2 * * *' = Every day at 2:00 AM
        // '0 */6 * * *' = Every 6 hours
        const schedule = process.env.BACKUP_SCHEDULE || '0 0 * * *';

        console.log(`[SCHEDULER] 🕐 Initializing Daily Backup with schedule: ${schedule}`);

        cron.schedule(schedule, async () => {
            const now = new Date().toLocaleString('fr-FR');
            console.log(`[SCHEDULER] ⏳ Starting scheduled backup at ${now}...`);

            try {
                const result = await backupService.performBackup();
                const sizeKB = (result.size / 1024).toFixed(2);
                console.log(`[SCHEDULER] ✅ Backup Success: ${result.filename} (${sizeKB} KB)`);
            } catch (error) {
                console.error('[SCHEDULER] ❌ Backup Failed:', error.message);
            }
        });

        console.log(`[SCHEDULER] ✅ Backup scheduler initialized`);
    }

    /**
     * Initialize the subscription and trial expiry check schedule
     * Runs daily at 1:00 AM
     */
    initSubscriptionExpiryCheck() {
        const schedule = '0 1 * * *';
        console.log(`[SCHEDULER] 🕐 Initializing Trial Expiry Check with schedule: ${schedule}`);

        cron.schedule(schedule, async () => {
            const now = new Date().toLocaleString('fr-FR');
            console.log(`[SCHEDULER] ⏳ Starting trial expiry scan at ${now}...`);

            try {
                const result = await pool.query(`
                    UPDATE Tenants
                    SET SubscriptionStatus = 'EXPIRED', UpdatedAt = CURRENT_TIMESTAMP
                    WHERE PlanType = 'TRIAL'
                      AND SubscriptionStatus = 'ACTIVE'
                      AND TrialEndDate < CURRENT_TIMESTAMP
                `);
                console.log(`[SCHEDULER] ✅ Trial Expiry Scan Complete. Updated ${result.rowCount} stores to EXPIRED.`);
            } catch (error) {
                console.error('[SCHEDULER] ❌ Trial Expiry Scan Failed:', error.message);
            }
        });

        console.log(`[SCHEDULER] ✅ Trial Expiry scheduler initialized`);
    }
}

module.exports = new SchedulerService();

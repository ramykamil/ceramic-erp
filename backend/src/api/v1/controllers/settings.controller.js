const pool = require('../../../config/database');

// GET Settings
async function getSettings(req, res, next) {
    try {
        const result = await pool.query('SELECT * FROM AppSettings LIMIT 1');
        if (result.rows.length === 0) {
            // Initialize default settings if none exist
            const insertResult = await pool.query(`
                INSERT INTO AppSettings (CompanyName, Activity, DefaultPrintFormat) 
                VALUES ('ALLAOUA CERAM', 'MATERIAUX DE CONSTRUCTION', 'TICKET')
                RETURNING *
            `);
            return res.json({ success: true, data: insertResult.rows[0] });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error getting settings:', error);
        next(error);
    }
}

// UPDATE Settings
async function updateSettings(req, res, next) {
    try {
        const {
            companyname, activity, address, phone1, phone2, email,
            rc, nif, ai, nis, rib, capital,
            defaultprintformat, ticketwidth, ticketheader, ticketfooter, showbalanceonticket,
            enablepalletmanagement, updatepurchaseprice, barcodeprefix, defaulttaxrate, defaulttimbre,
            retailmargin, wholesalemargin,
            retailmargintype, wholesalemargintype,
            workstarttime, workendtime, allowedips
        } = req.body;

        const query = `
            UPDATE AppSettings SET
                CompanyName = COALESCE($1, CompanyName),
                Activity = COALESCE($2, Activity),
                Address = COALESCE($3, Address),
                Phone1 = COALESCE($4, Phone1),
                Phone2 = COALESCE($5, Phone2),
                Email = COALESCE($6, Email),
                RC = COALESCE($7, RC),
                NIF = COALESCE($8, NIF),
                AI = COALESCE($9, AI),
                NIS = COALESCE($10, NIS),
                RIB = COALESCE($11, RIB),
                Capital = COALESCE($12, Capital),
                DefaultPrintFormat = COALESCE($13, DefaultPrintFormat),
                TicketWidth = COALESCE($14, TicketWidth),
                TicketHeader = COALESCE($15, TicketHeader),
                TicketFooter = COALESCE($16, TicketFooter),
                ShowBalanceOnTicket = COALESCE($17, ShowBalanceOnTicket),
                EnablePalletManagement = COALESCE($18, EnablePalletManagement),
                UpdatePurchasePrice = COALESCE($19, UpdatePurchasePrice),
                BarcodePrefix = COALESCE($20, BarcodePrefix),
                DefaultTaxRate = COALESCE($21, DefaultTaxRate),
                DefaultTimbre = COALESCE($22, DefaultTimbre),
                RetailMargin = COALESCE($23, RetailMargin),
                WholesaleMargin = COALESCE($24, WholesaleMargin),
                RetailMarginType = COALESCE($25, RetailMarginType),
                WholesaleMarginType = COALESCE($26, WholesaleMarginType),
                WorkStartTime = COALESCE($27, WorkStartTime),
                WorkEndTime = COALESCE($28, WorkEndTime),
                AllowedIPs = COALESCE($29, AllowedIPs),
                UpdatedAt = NOW(),
                UpdatedBy = $30
            WHERE SettingID = (SELECT SettingID FROM AppSettings LIMIT 1)
            RETURNING *
        `;

        const result = await pool.query(query, [
            companyname, activity, address, phone1, phone2, email,
            rc, nif, ai, nis, rib, capital,
            defaultprintformat, ticketwidth, ticketheader, ticketfooter, showbalanceonticket,
            enablepalletmanagement, updatepurchaseprice, barcodeprefix, defaulttaxrate, defaulttimbre,
            retailmargin, wholesalemargin,
            retailmargintype, wholesalemargintype,
            workstarttime, workendtime, allowedips,
            req.user?.userId || null
        ]);

        res.json({ success: true, message: "Paramètres mis à jour avec succès", data: result.rows[0] });
    } catch (error) {
        console.error('Error updating settings:', error);
        next(error);
    }
}

// BACKUP Database using Backup Service
async function triggerBackup(req, res, next) {
    try {
        const backupService = require('../../services/backup.service');
        const result = await backupService.performBackup();
        res.json(result);
    } catch (error) {
        console.error('Error triggering backup:', error);
        res.status(500).json({ success: false, message: "Échec de la sauvegarde (Erreur système)" });
    }
}

// GET Users (for user management tab)
// Note: Users table columns: userid, username, passwordhash, email, employeeid, role, isactive, lastlogin, createdat, updatedat
async function getUsers(req, res, next) {
    try {
        const result = await pool.query(`
            SELECT UserID, Username, Email, Role, Permissions, IsActive, CreatedAt, LastLogin
            FROM Users
            ORDER BY CreatedAt DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error getting users:', error);
        next(error);
    }
}

// CREATE User
async function createUser(req, res, next) {
    try {
        const { username, password, role, email, isactive, permissions } = req.body;
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Handle permissions: convert to JSON string for JSONB, or null if empty
        const permissionsJson = (permissions && permissions.length > 0)
            ? JSON.stringify(permissions)
            : null;

        const result = await pool.query(`
            INSERT INTO Users (Username, PasswordHash, Role, Email, IsActive, Permissions)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING UserID, Username, Role, Email, IsActive, Permissions, CreatedAt
        `, [username, hashedPassword, role || 'SALES_RETAIL', email, isactive !== false, permissionsJson]);

        res.json({ success: true, message: "Utilisateur créé", data: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: "Ce nom d'utilisateur existe déjà" });
        }
        console.error('Error creating user:', error);
        next(error);
    }
}

// UPDATE User
async function updateUser(req, res, next) {
    try {
        const { id } = req.params;
        const { username, role, email, isactive, password, permissions } = req.body;

        // Check if username already exists (if changed)
        if (username) {
            const existingUser = await pool.query('SELECT UserID FROM Users WHERE Username = $1 AND UserID != $2', [username, id]);
            if (existingUser.rows.length > 0) {
                return res.status(400).json({ success: false, message: "Ce nom d'utilisateur est déjà utilisé" });
            }
        }

        // Handle permissions: convert to JSON string for JSONB, or null if empty
        const permissionsJson = (permissions && permissions.length > 0)
            ? JSON.stringify(permissions)
            : null;

        let query, params;

        if (password) {
            // Update with new password
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password, 10);
            query = `
                UPDATE Users SET Username=COALESCE($1, Username), Role=$2, Email=$3, IsActive=$4, PasswordHash=$5, Permissions=$6, UpdatedAt=NOW()
                WHERE UserID=$7
                RETURNING UserID, Username, Role, Email, IsActive, Permissions
            `;
            params = [username, role, email, isactive, hashedPassword, permissionsJson, id];
        } else {
            // Update without password change
            query = `
                UPDATE Users SET Username=COALESCE($1, Username), Role=$2, Email=$3, IsActive=$4, Permissions=$5, UpdatedAt=NOW()
                WHERE UserID=$6
                RETURNING UserID, Username, Role, Email, IsActive, Permissions
            `;
            params = [username, role, email, isactive, permissionsJson, id];
        }

        const result = await pool.query(query, params);
        res.json({ success: true, message: "Utilisateur mis à jour", data: result.rows[0] });
    } catch (error) {
        console.error('Error updating user:', error);
        next(error);
    }
}

// DELETE User
async function deleteUser(req, res, next) {
    try {
        const { id } = req.params;

        // Prevent deleting the last admin
        const adminCount = await pool.query("SELECT COUNT(*) FROM Users WHERE Role='ADMIN' AND IsActive=true");
        const userToDelete = await pool.query("SELECT Role FROM Users WHERE UserID=$1", [id]);

        if (userToDelete.rows[0]?.role === 'ADMIN' && parseInt(adminCount.rows[0].count) <= 1) {
            return res.status(400).json({ success: false, message: "Impossible de supprimer le dernier administrateur" });
        }

        await pool.query('DELETE FROM Users WHERE UserID = $1', [id]);
        res.json({ success: true, message: "Utilisateur supprimé" });
    } catch (error) {
        console.error('Error deleting user:', error);
        next(error);
    }
}



// GET Active Sessions
const getActiveSessions = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.SessionID, s.UserID, s.IPAddress, s.UserAgent, s.LoginTime, s.LastActive, u.Username, u.Role
            FROM ActiveSessions s
            JOIN Users u ON s.UserID = u.UserID
            WHERE s.LastActive > NOW() - INTERVAL '30 DAYS'
            ORDER BY s.LastActive DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    triggerBackup,
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    getActiveSessions
};

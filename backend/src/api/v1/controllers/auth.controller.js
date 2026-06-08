const pool = require('../../../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../../config/config');

/**
 * Handle user login
 */
async function login(req, res, next) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Nom d\'utilisateur et mot de passe requis' });
  }

  try {
    // Find user by username
    const userQuery = 'SELECT * FROM Users WHERE Username = $1 AND IsActive = TRUE';
    const userResult = await pool.query(userQuery, [username]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Nom d\'utilisateur ou mot de passe incorrect' });
    }

    const user = userResult.rows[0];

    // Compare password hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordhash); // uses passwordhash column

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Nom d\'utilisateur ou mot de passe incorrect' });
    }

    // --- Access Restrictions Check for Restricted Roles ---
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      const settingsResult = await pool.query('SELECT workstarttime, workendtime, allowedips FROM AppSettings LIMIT 1');
      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];

        // IP Check
        if (settings.allowedips && settings.allowedips.trim() !== '') {
          const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip;
          const allowedList = settings.allowedips.split(',').map(ip => ip.trim()).filter(ip => ip);
          const isAllowed = allowedList.some(allowedIp => clientIP && clientIP.includes(allowedIp));

          if (!isAllowed) {
            return res.status(403).json({ success: false, message: "Accès refusé: Votre adresse IP n'est pas autorisée.", code: 'IP_NOT_ALLOWED' });
          }
        }

        // Time Check
        if (settings.workstarttime && settings.workendtime) {
          const now = new Date();
          const currentTime = now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit', hour12: false });

          if (currentTime < settings.workstarttime || currentTime > settings.workendtime) {
            return res.status(403).json({ success: false, message: "Accès restreint en dehors des heures de travail.", code: 'OUTSIDE_WORKING_HOURS' });
          }
        }
      }
    }

    // Generate JWT
    const payload = {
      userId: user.userid, // uses userid column
      username: user.username,
      role: user.role, // uses role column
      permissions: user.permissions, // Granular permissions
      tenantId: user.tenantid
    };

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    // Optionally update LastLogin timestamp (async, don't wait)
    pool.query('UPDATE Users SET LastLogin = CURRENT_TIMESTAMP WHERE UserID = $1', [user.userid]);

    // Log login event to AuditLogs
    pool.query(
      `INSERT INTO AuditLogs (UserID, Action, TableName, RecordID, IPAddress, UserAgent)
       VALUES ($1, 'LOGIN', 'Users', $1, $2, $3)`,
      [user.userid, req.ip, req.headers['user-agent']]
    ).catch(err => console.error('Failed to log login audit:', err));

    // Log active session
    pool.query(
      `INSERT INTO ActiveSessions (UserID, IPAddress, UserAgent)
       VALUES ($1, $2, $3)`,
      [user.userid, req.ip, req.headers['user-agent']]
    ).catch(err => console.error('Failed to log active session:', err));

    res.json({
      success: true,
      message: 'Connexion réussie',
      token: token,
      user: { // Send back some user info (optional, exclude sensitive data)
        userId: user.userid,
        username: user.username,
        email: user.email, // uses email column
        role: user.role,
        permissions: user.permissions,
        tenantId: user.tenantid
      }
    });

  } catch (error) {
    next(error); // Pass error to global error handler
  }
}

/**
 * Provision a new store tenant and seed default data
 */
async function registerStore(req, res, next) {
  const { storeName, domainPrefix, username, password, email } = req.body;

  if (!storeName || !domainPrefix || !username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Store Name, Domain Prefix, Username and Password are required.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if domain prefix is already taken
    const domainCheck = await client.query('SELECT TenantID FROM Tenants WHERE DomainPrefix = $1', [domainPrefix.toLowerCase()]);
    if (domainCheck.rows.length > 0) {
      throw new Error('This domain prefix is already taken.');
    }

    // 2. Check if username is already taken
    const userCheck = await client.query('SELECT UserID FROM Users WHERE Username = $1', [username]);
    if (userCheck.rows.length > 0) {
      throw new Error('This username is already taken.');
    }

    // 3. Create Tenant
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 20); // 20-day free trial

    const tenantResult = await client.query(`
      INSERT INTO Tenants (StoreName, DomainPrefix, PlanType, TrialEndDate, SubscriptionStatus)
      VALUES ($1, $2, 'TRIAL', $3, 'ACTIVE')
      RETURNING TenantID;
    `, [storeName, domainPrefix.toLowerCase(), trialEndDate]);
    const tenantId = tenantResult.rows[0].tenantid;

    // 4. Set session variable for subsequent RLS scopes
    await client.query('SET app.current_tenant_id = $1', [tenantId]);

    // 5. Seed default AppSettings for this tenant
    await client.query(`
      INSERT INTO AppSettings (CompanyName, Activity, DefaultPrintFormat, DefaultTaxRate, DefaultTimbre, RetailMargin, WholesaleMargin, RetailMarginType, WholesaleMarginType, TenantID)
      VALUES ($1, 'MATERIAUX DE CONSTRUCTION', 'TICKET', 19, 0, 30, 15, 'PERCENT', 'PERCENT', $2)
    `, [storeName, tenantId]);

    // 6. Seed default Warehouse
    await client.query(`
      INSERT INTO Warehouses (WarehouseCode, WarehouseName, Location, IsActive, TenantID)
      VALUES ('MAIN', 'Entrepôt Principal', 'Local', 1, $1)
    `, [tenantId]);

    // 7. Seed default Units
    const defaultUnits = [
      ['PCS', 'Pièces', 'Pièces individuelles'],
      ['BOX', 'Carton', 'Carton/Colis'],
      ['SQM', 'M²', 'Mètre carré'],
      ['PAL', 'Palette', 'Palette complète']
    ];
    for (const [code, name, desc] of defaultUnits) {
      await client.query(`
        INSERT INTO Units (UnitCode, UnitName, Description, TenantID)
        VALUES ($1, $2, $3, $4)
      `, [code, name, desc, tenantId]);
    }

    // 8. Create Admin User for this tenant
    const hashedPassword = await bcrypt.hash(password, 10);
    await client.query(`
      INSERT INTO Users (Username, PasswordHash, Role, Email, IsActive, TenantID)
      VALUES ($1, $2, 'ADMIN', $3, 1, $4)
    `, [username, hashedPassword, email || null, tenantId]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Store registered successfully with a 20-day free trial.',
      tenantId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({
      success: false,
      message: error.message || 'Error occurred during registration.'
    });
  } finally {
    client.release();
  }
}

module.exports = {
  login,
  registerStore
};
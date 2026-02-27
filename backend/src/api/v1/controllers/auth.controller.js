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
      permissions: user.permissions // Granular permissions
      // Add other relevant info if needed
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
        permissions: user.permissions
      }
    });

  } catch (error) {
    next(error); // Pass error to global error handler
  }
}

module.exports = {
  login,
};
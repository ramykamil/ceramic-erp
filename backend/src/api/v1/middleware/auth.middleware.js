const jwt = require('jsonwebtoken');
const config = require('../../../config/config');
const pool = require('../../../config/database');

/**
 * Middleware to verify JWT token and authenticate users
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  jwt.verify(token, config.jwt.secret, async (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Verify the user actually exists in the database (handles DB seeds/resets invalidating tokens)
    try {
      const dbUserResult = await pool.query('SELECT UserID, Role, Username, IsActive, TenantID FROM Users WHERE UserID = $1', [user.userId]);
      if (dbUserResult.rows.length === 0 || !dbUserResult.rows[0].isactive) {
        return res.status(401).json({
          success: false,
          message: 'L\'utilisateur n\'existe plus ou est désactivé. Veuillez vous reconnecter.'
        });
      }
      // Set/update req.user to match current DB record details
      req.user = {
        ...user,
        role: dbUserResult.rows[0].role,
        username: dbUserResult.rows[0].username,
        tenantId: dbUserResult.rows[0].tenantid
      };
    } catch (dbErr) {
      console.error('Database user validation error in auth middleware:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Erreur interne de validation utilisateur'
      });
    }

    // Check Working Hours and IP restrictions
    // Skip restrictions for ADMIN and MANAGER
    if (user.role === 'ADMIN' || user.role === 'MANAGER') {
      return next();
    }

    try {
      const settingsResult = await pool.query('SELECT WorkStartTime, WorkEndTime, AllowedIPs FROM AppSettings LIMIT 1');
      if (settingsResult.rows.length === 0) return next();

      const settings = settingsResult.rows[0];

      // IP Whitelisting Check
      if (settings.allowedips && settings.allowedips.trim() !== '') {
        const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip;
        const allowedList = settings.allowedips.split(',').map(ip => ip.trim()).filter(ip => ip);

        const isAllowed = allowedList.some(allowedIp => clientIP?.includes(allowedIp));

        if (!isAllowed) {
          return res.status(403).json({
            success: false,
            message: "Accès refusé: Votre adresse IP n'est pas autorisée.",
            code: 'IP_NOT_ALLOWED'
          });
        }
      }

      // Working Hours Check
      if (settings.workstarttime && settings.workendtime) {
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit', hour12: false });
        // '08:00' format

        if (currentTime < settings.workstarttime || currentTime > settings.workendtime) {
          return res.status(403).json({
            success: false,
            message: 'Accès restreint en dehors des heures de travail.',
            code: 'OUTSIDE_WORKING_HOURS'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Error checking working hours/IP:', error);
      next(error);
    }
  });
}

/**
 * Middleware to check if user has required role
 * Accepts either spread arguments or a single array
 */
function requireRole(...roles) {
  // If first argument is an array, use it as the roles array
  const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
}

/**
 * Middleware to restrict access to super administrators (Admin role on default tenant)
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const DEFAULT_TENANT_ID = 'd0000000-0000-0000-0000-000000000000';
  if (req.user.tenantId !== DEFAULT_TENANT_ID || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access restricted to Super-Admin only.'
    });
  }

  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  requireSuperAdmin
};


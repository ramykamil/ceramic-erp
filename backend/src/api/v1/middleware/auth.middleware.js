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

    req.user = user;

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


module.exports = {
  authenticateToken,
  requireRole
};


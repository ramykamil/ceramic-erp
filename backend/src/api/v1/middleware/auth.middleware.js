const jwt = require('jsonwebtoken');
const config = require('../../../config/config');

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

  jwt.verify(token, config.jwt.secret, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    req.user = user;
    next();
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
 * Middleware to check if user has required permission
 * @param {string} permissionKey 
 */
function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Role-based fallbacks if no explicit permissions exist
    const role = req.user.role;
    const userPermissions = req.user.permissions;

    // If user has specific permissions defined, check them
    if (userPermissions && Array.isArray(userPermissions)) {
      if (userPermissions.includes(permissionKey)) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: `Permission denied: ${permissionKey} required`
      });
    }

    // Fallback to Role Defaults if Permissions is null/undefined
    // This allows backward compatibility
    const roleDefaults = {
      'ADMIN': ['ALL'], // Special case
      'MANAGER': ['sales_pos', 'orders', 'customers', 'inventory', 'products', 'purchasing', 'logistics', 'accounting', 'reports', 'brands', 'hr'],
      'SALES': ['sales_pos', 'orders', 'customers', 'products'],
      'SALES_RETAIL': ['sales_pos', 'orders', 'products', 'inventory'],
      'SALES_WHOLESALE': ['sales_pos', 'orders', 'customers', 'products', 'purchasing'],
      'WAREHOUSE': ['inventory', 'purchasing', 'logistics']
    };

    if (role === 'ADMIN') return next();

    const allowed = roleDefaults[role] || [];
    if (allowed.includes(permissionKey)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied for role ${role} to ${permissionKey}`
    });
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  requirePermission
};


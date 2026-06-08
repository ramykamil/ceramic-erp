const { runWithTenant } = require('../utils/tenantContext');
const jwt = require('jsonwebtoken');
const config = require('../../../config/config');

const DEFAULT_TENANT_ID = 'd0000000-0000-0000-0000-000000000000';

/**
 * Middleware to establish the Tenant context.
 * Resolves TenantID from JWT token, custom headers, or falls back to default tenant.
 */
function tenantScoping(req, res, next) {
  let tenantId = DEFAULT_TENANT_ID;

  // 1. Try to extract from request headers (useful for non-auth or custom provisioning requests)
  const headerTenant = req.headers['x-tenant-id'];
  if (headerTenant) {
    tenantId = headerTenant;
  } else {
    // 2. Try to extract from Authorization header JWT if present (without rejecting if missing)
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        if (decoded && decoded.tenantId) {
          tenantId = decoded.tenantId;
        }
      } catch (err) {
        // Silently fail JWT parsing, let auth.middleware handle expired/invalid tokens
      }
    }
  }

  // Bind request context
  req.tenantId = tenantId;

  // Run the rest of the request chain inside the tenant context
  runWithTenant(tenantId, () => {
    next();
  });
}

module.exports = {
  tenantScoping,
  DEFAULT_TENANT_ID
};

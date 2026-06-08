const pool = require('../../../config/database');

/**
 * Middleware to check tenant subscription and trial duration.
 * Blocks access to business features if the trial has expired or subscription is inactive.
 */
async function checkSubscription(req, res, next) {
  // Bypass paths (e.g., login, registration, health, and billing checkout/plans)
  const bypassPaths = [
    '/auth/login',
    '/auth/register-store',
    '/health',
    '/billing/plans',
    '/billing/subscribe',
    '/billing/status'
  ];

  if (bypassPaths.some(path => req.path.includes(path))) {
    return next();
  }

  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is missing.'
      });
    }

    // Query database directly bypassing context wrapping if it checks tenants table
    // (Tenants table itself is not restricted by RLS in the same way or uses direct client)
    const result = await pool.query(
      'SELECT SubscriptionStatus, TrialEndDate, PlanType FROM Tenants WHERE TenantID = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant store registration not found.'
      });
    }

    const tenant = result.rows[0];

    // 1. Explicitly check status flag
    if (tenant.subscriptionstatus === 'EXPIRED' || tenant.subscriptionstatus === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Votre période d\'essai ou votre abonnement a expiré. Veuillez renouveler votre abonnement pour continuer.'
      });
    }

    // 2. Double-check trial expiration timestamp (lazy evaluation safety)
    if (tenant.plantype === 'TRIAL') {
      const trialEnd = new Date(tenant.trialenddate);
      if (trialEnd < new Date()) {
        // Update DB status to EXPIRED
        await pool.query(
          "UPDATE Tenants SET SubscriptionStatus = 'EXPIRED', UpdatedAt = CURRENT_TIMESTAMP WHERE TenantID = $1",
          [tenantId]
        );

        return res.status(403).json({
          success: false,
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'Votre période d\'essai de 20 jours a expiré. Veuillez souscrire à un abonnement pour continuer.'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Subscription verification failed:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne de vérification de l\'abonnement.'
    });
  }
}

module.exports = {
  checkSubscription
};

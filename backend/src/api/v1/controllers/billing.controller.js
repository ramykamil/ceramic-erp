const pool = require('../../../config/database');

/**
 * GET /billing/status
 * Retrieve subscription status and trial counters for the active tenant
 */
async function getBillingStatus(req, res, next) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context is missing.' });
    }

    const result = await pool.query(
      'SELECT StoreName, PlanType, TrialStartDate, TrialEndDate, SubscriptionStatus, CreatedAt FROM Tenants WHERE TenantID = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Store tenant not found.' });
    }

    const tenant = result.rows[0];
    const now = new Date();
    const trialEnd = new Date(tenant.trialenddate);
    
    // Calculate days remaining (max 0 if expired)
    const timeDiff = trialEnd.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));

    res.json({
      success: true,
      data: {
        storeName: tenant.storename,
        planType: tenant.plantype,
        subscriptionStatus: tenant.subscriptionstatus,
        trialStartDate: tenant.trialstartdate,
        trialEndDate: tenant.trialenddate,
        daysRemaining,
        isExpired: tenant.subscriptionstatus === 'EXPIRED' || (tenant.plantype === 'TRIAL' && trialEnd < now),
        joinedAt: tenant.createdat
      }
    });
  } catch (error) {
    console.error('Error fetching billing status:', error);
    next(error);
  }
}

/**
 * POST /billing/subscribe
 * Mock subscription activation (Stripe/Paddle integration mockup)
 */
async function subscribe(req, res, next) {
  const { planType, paymentMethod } = req.body; // PlanType: BASIC | PREMIUM

  if (!planType || !['BASIC', 'PREMIUM', 'TRIAL'].includes(planType)) {
    return res.status(400).json({ success: false, message: 'Invalid or missing plan type.' });
  }

  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context is missing.' });
    }

    // Set SubscriptionStatus = ACTIVE
    // If upgrading to TRIAL (resetting trial for admin test purposes), calculate new TrialEndDate
    let updateQuery;
    let queryParams;

    if (planType === 'TRIAL') {
      const newTrialEnd = new Date();
      newTrialEnd.setDate(newTrialEnd.getDate() + 20); // Add 20 days
      updateQuery = `
        UPDATE Tenants 
        SET PlanType = 'TRIAL', SubscriptionStatus = 'ACTIVE', TrialEndDate = $1, UpdatedAt = CURRENT_TIMESTAMP
        WHERE TenantID = $2
        RETURNING *
      `;
      queryParams = [newTrialEnd, tenantId];
    } else {
      // Basic / Premium standard plans
      // Subscriptions set TrialEndDate to a far future or null, we will set it to 1 year from now
      const subscriptionExpiry = new Date();
      subscriptionExpiry.setFullYear(subscriptionExpiry.getFullYear() + 1);
      updateQuery = `
        UPDATE Tenants 
        SET PlanType = $1, SubscriptionStatus = 'ACTIVE', TrialEndDate = $2, UpdatedAt = CURRENT_TIMESTAMP
        WHERE TenantID = $3
        RETURNING *
      `;
      queryParams = [planType, subscriptionExpiry, tenantId];
    }

    const result = await pool.query(updateQuery, queryParams);

    res.json({
      success: true,
      message: `Abonnement ${planType} activé avec succès.`,
      data: {
        planType: result.rows[0].plantype,
        subscriptionStatus: result.rows[0].subscriptionstatus,
        trialEndDate: result.rows[0].trialenddate
      }
    });
  } catch (error) {
    console.error('Error handling subscription payment mockup:', error);
    next(error);
  }
}

module.exports = {
  getBillingStatus,
  subscribe
};

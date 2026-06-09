const pool = require('../../../config/database');

/**
 * Super-Admin Controller
 * Handles cross-tenant management of all stores/tenants, subscription plans, and sign-ups.
 */

// 1. Get all stores with details and user counts
async function getAllStores(req, res, next) {
  try {
    const query = `
      SELECT 
        t.TenantID as tenantid,
        t.StoreName as storename,
        t.DomainPrefix as domainprefix,
        t.PlanType as plantype,
        t.TrialStartDate as trialstartdate,
        t.TrialEndDate as trialenddate,
        t.SubscriptionStatus as subscriptionstatus,
        t.CreatedAt as createdat,
        t.UpdatedAt as updatedat,
        COUNT(u.UserID)::int as usercount,
        CEIL(EXTRACT(EPOCH FROM (t.TrialEndDate - NOW())) / 86400)::int as daysremaining
      FROM Tenants t
      LEFT JOIN Users u ON t.TenantID = u.TenantID
      GROUP BY t.TenantID
      ORDER BY t.CreatedAt DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

// 2. Update store subscription details (PlanType, SubscriptionStatus, TrialEndDate)
async function updateStoreSubscription(req, res, next) {
  const { id } = req.params; // TenantID
  const { planType, subscriptionStatus, trialEndDate } = req.body;

  try {
    // Check if store exists
    const checkRes = await pool.query('SELECT TenantID FROM Tenants WHERE TenantID = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Boutique non trouvée' });
    }

    // Build update query dynamically
    const fields = [];
    const params = [id];
    let paramIndex = 2;

    if (planType !== undefined) {
      fields.push(`PlanType = $${paramIndex++}`);
      params.push(planType);
    }
    if (subscriptionStatus !== undefined) {
      fields.push(`SubscriptionStatus = $${paramIndex++}`);
      params.push(subscriptionStatus);
    }
    if (trialEndDate !== undefined) {
      fields.push(`TrialEndDate = $${paramIndex++}`);
      params.push(trialEndDate);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun champ à mettre à jour fourni' });
    }

    const updateQuery = `
      UPDATE Tenants 
      SET ${fields.join(', ')}, UpdatedAt = CURRENT_TIMESTAMP
      WHERE TenantID = $1 
      RETURNING *
    `;
    const result = await pool.query(updateQuery, params);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Abonnement de la boutique mis à jour avec succès'
    });
  } catch (error) {
    next(error);
  }
}

// 3. Get system stats and recent signups/logins
async function getSystemStats(req, res, next) {
  try {
    // KPI metrics
    const statsQuery = `
      SELECT 
        COUNT(*)::int as totalstores,
        COUNT(CASE WHEN PlanType = 'TRIAL' AND SubscriptionStatus = 'ACTIVE' THEN 1 END)::int as activetrials,
        COUNT(CASE WHEN PlanType IN ('BASIC', 'PREMIUM') AND SubscriptionStatus = 'ACTIVE' THEN 1 END)::int as activepaid,
        COUNT(CASE WHEN SubscriptionStatus = 'EXPIRED' THEN 1 END)::int as expiredstores,
        COUNT(CASE WHEN SubscriptionStatus = 'SUSPENDED' THEN 1 END)::int as suspendedstores
      FROM Tenants
    `;
    const statsResult = await pool.query(statsQuery);

    // Recent store sign-ups
    const signupsQuery = `
      SELECT 
        TenantID as tenantid,
        StoreName as storename,
        DomainPrefix as domainprefix,
        PlanType as plantype,
        CreatedAt as createdat
      FROM Tenants
      ORDER BY CreatedAt DESC
      LIMIT 10
    `;
    const signupsResult = await pool.query(signupsQuery);

    res.json({
      success: true,
      data: {
        stats: statsResult.rows[0],
        recentSignups: signupsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllStores,
  updateStoreSubscription,
  getSystemStats
};

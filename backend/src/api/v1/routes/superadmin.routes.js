const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadmin.controller');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth.middleware');

// Protect all routes under this file with auth + requireSuperAdmin
router.use(authenticateToken);
router.use(requireSuperAdmin);

router.get('/stores', superadminController.getAllStores);
router.put('/stores/:id/subscription', superadminController.updateStoreSubscription);
router.get('/stats', superadminController.getSystemStats);

module.exports = router;

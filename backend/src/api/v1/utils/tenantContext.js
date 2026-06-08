const { AsyncLocalStorage } = require('async_hooks');

const tenantStorage = new AsyncLocalStorage();

module.exports = {
  tenantStorage,
  getTenantId: () => tenantStorage.getStore(),
  runWithTenant: (tenantId, callback) => tenantStorage.run(tenantId, callback)
};

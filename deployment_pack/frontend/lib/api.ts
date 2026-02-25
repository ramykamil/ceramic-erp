// API calls now go through Next.js proxy on same origin
// Next.js rewrites /api/v1/* to http://localhost:5000/api/v1/*
// This fixes iOS Safari blocking fetch() to different ports
const getApiBaseUrl = () => {
  // Use relative URL - works on any device since it stays on same origin
  return '/api/v1';
};

const API_BASE_URL = getApiBaseUrl();

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  token?: string; // For login response
  user?: {
    role: string;
    username: string;
    permissions?: string[] | null;
    [key: string]: any;
  };
}

// Define interfaces for our data models to ensure type safety
interface Category { categoryid: number; categoryname: string; }
interface Brand {
  brandid: number;
  brandname: string;
  description?: string | null;
  isactive?: boolean;
}
interface Unit { unitid: number; unitname: string; unitcode: string; }

interface Product {
  productid: number;
  productcode: string;
  productname: string;
  categoryid: number | null;
  brandid: number | null;
  primaryunitid: number | null;
  description: string | null;
  baseprice: number;
  ImageUrl?: string | null; // Match DB column
  // Add other fields from your API response if needed
  categoryname?: string | null;
  brandname?: string | null;
}

// Interface for adjustment data payload
interface StockAdjustmentData {
  productId: number;
  warehouseId: number;
  quantity: number; // Can be negative
  ownershipType: 'OWNED' | 'CONSIGNMENT';
  factoryId?: number | null; // Required if consignment
  notes?: string;
}

// Interface for PO Item
interface PurchaseOrderItemData {
  productId: number;
  quantity: number;
  unitId: number;
  unitPrice: number;
}

// Interface for PO Header
interface PurchaseOrderData {
  factoryId?: number;  // Legacy support
  supplierId?: number; // New: actual supplier ID
  supplierType?: 'BRAND' | 'FACTORY'; // New: supplier type
  warehouseId: number;
  orderDate: string; // YYYY-MM-DD
  expectedDeliveryDate?: string | null;
  ownershipType: 'OWNED' | 'CONSIGNMENT';
  notes?: string;
  payment?: number;  // Payment amount
  paymentMethod?: 'ESPECE' | 'VIREMENT' | 'CHEQUE';
  items: PurchaseOrderItemData[];
}

// Interface pour les articles du BR (payload)
interface GoodsReceiptItemData {
  poItemId: number;
  productId: number;
  unitId: number;
  quantityReceived: number;
  ownershipType: 'OWNED' | 'CONSIGNMENT'; // Nécessaire pour la transaction
  factoryId?: number | null; // Nécessaire pour la transaction
}

// Interface pour l'en-tête du BR (payload)
interface GoodsReceiptData {
  purchaseOrderId: number;
  warehouseId: number;
  factoryId: number;
  ownershipType: 'OWNED' | 'CONSIGNMENT';
  receiptDate: string; // YYYY-MM-DD
  notes?: string;
  items: GoodsReceiptItemData[];
}

interface Settlement {
  settlementid: number;
  factoryid: number;
  factoryname: string;
  startdate: string;
  enddate: string;
  totalamount: number;
  status: 'PENDING' | 'PAID';
  createdat: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers = new Headers(options.headers);

    // Set default Content-Type if not already present
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    // CRITICAL: Get API URL dynamically at request time for LAN support
    const apiUrl = getApiBaseUrl();

    try {
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Products
  async getProducts(params?: { search?: string; page?: number; limit?: number; famille?: string; choix?: string; calibre?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/products?${query}`);
  }

  async getProductFilters() {
    return this.request<{ familles: string[]; choix: string[] }>('/products/filters');
  }

  async getProduct(id: number): Promise<ApiResponse<Product>> {
    return this.request<Product>(`/products/${id}`);
  }

  async getProductUnits(productId: number) {
    return this.request(`/products/${productId}/units`);
  }

  async createProduct(data: any) { // Add create method
    return this.request('/products', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateProduct(id: number, data: any) { // Add update method
    return this.request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteProduct(id: number) {
    return this.request(`/products/${id}`, { method: 'DELETE' });
  }

  async getProductSalesHistory(productId: number, params?: { startDate?: string; endDate?: string }) {
    const queryString = params ? new URLSearchParams(params as any).toString() : '';
    return this.request(`/products/${productId}/sales-history?${queryString}`);
  }

  async importProducts(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    // Fetch requires manual token header for FormData
    const response = await fetch(`${this.baseUrl}/products/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        // 'Content-Type': 'multipart/form-data' // Browser sets this automatically with boundary for FormData
      },
      body: formData,
    });
    return response.json(); // Return the parsed JSON response
  }

  async exportProducts() {
    const response = await fetch(`${this.baseUrl}/products/export`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      // Try to parse error message from backend if available
      const errorData = await response.json().catch(() => ({})); // Catch if response is not JSON
      throw new Error(errorData.message || `Export failed with status: ${response.status}`);
    }
    return response.blob(); // Return blob for download
  }

  // Inventory
  async getInventoryLevels(params?: { search?: string; productId?: number; warehouseId?: number; warehouseType?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/inventory/levels?${query}`);
  }

  async getInventoryTransactions(params?: { search?: string; productId?: number; warehouseId?: number; transactionType?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/inventory/transactions?${query}`);
  }

  async adjustStock(data: StockAdjustmentData): Promise<ApiResponse<any>> {
    return this.request<any>('/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Inventory Import / Export ---

  async importStock(file: File, warehouseId: number) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('warehouseId', warehouseId.toString());

    // Use fetch directly for FormData to allow browser to set Content-Type/Boundary automatically
    const response = await fetch(`${this.baseUrl}/inventory/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });

    return response.json();
  }



  async exportStock() {
    const response = await fetch(`${this.baseUrl}/inventory/export`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(error.message || `Export failed with status: ${response.status}`);
    }

    return response.blob();
  }

  async importInventory(file: File): Promise<ApiResponse<any>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<any>('/inventory/import', {
      method: 'POST',
      body: formData,
    });
  }

  async exportInventory(): Promise<Blob> {
    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${this.baseUrl}/inventory/export`, {
      headers,
    });

    if (!response.ok) {
      throw new Error('Failed to export inventory');
    }

    return response.blob();
  }

  // Auth
  async login(username: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  // General Settings
  async getSettings() {
    return this.request<any>('/settings');
  }

  async updateSettings(data: any) {
    return this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async createBackup() {
    return this.request('/settings/backup', { method: 'POST' });
  }

  async getActiveSessions() {
    return this.request<any[]>('/settings/sessions');
  }

  // Settings / User Management
  async getUsers() {
    return this.request<any[]>('/settings/users');
  }

  async getSalespersons() {
    return this.request<any[]>('/users/salespersons');
  }

  async createUser(data: any) {
    return this.request('/settings/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateUser(id: number, data: any) {
    return this.request(`/settings/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteUser(id: number) {
    return this.request(`/settings/users/${id}`, { method: 'DELETE' });
  }

  // Catalog Data (Categories, Brands, Units)
  async getCategories(): Promise<ApiResponse<Category[]>> {
    return this.request<Category[]>('/categories');
  }

  // Existing getBrands() may need update if response changes
  async getBrands(): Promise<ApiResponse<Brand[]>> {
    return this.request<Brand[]>('/brands');
  }


  // Add new methods
  async getBrand(id: number) {
    return this.request(`/brands/${id}`);
  }

  async createBrand(data: { brandName: string; description?: string }) {
    return this.request('/brands', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBrand(id: number, data: { brandName?: string; description?: string; isActive?: boolean }) {
    return this.request(`/brands/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBrand(id: number) {
    return this.request(`/brands/${id}`, {
      method: 'DELETE',
    });
  }

  async getUnits(): Promise<ApiResponse<Unit[]>> {
    return this.request<Unit[]>('/units');
  }

  // Customers
  async getCustomers(params?: { search?: string; customerType?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/customers?${query}`);
  }

  async getCustomer(id: number) {
    return this.request(`/customers/${id}`);
  }

  async createCustomer(data: any) {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCustomer(id: number, data: any) {
    return this.request(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCustomer(id: number) {
    return this.request(`/customers/${id}`, {
      method: 'DELETE',
    });
  }

  async hardDeleteCustomer(id: number) { // <-- AJOUTEZ CETTE MÉTHODE
    return this.request(`/customers/hard/${id}`, {
      method: 'DELETE',
    });
  }

  // Get customer-specific price for a product (with history lookup)
  async getCustomerProductPrice(customerId: number, productId: number) {
    return this.request(`/customers/${customerId}/product-price/${productId}`);
  }

  async getPriceLists() {
    return this.request('/pricelists');
  }

  // Customer-Specific Pricing (CRITICAL FEATURE)
  async getCustomerPrices(customerId: number) {
    return this.request(`/customers/${customerId}/prices`);
  }

  async setCustomerPrice(customerId: number, data: {
    productId: number;
    specificPrice: number;
    effectiveFrom?: string;
    effectiveTo?: string;
    notes?: string;
  }) {
    return this.request(`/customers/${customerId}/prices`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteCustomerPrice(customerId: number, productId: number) {
    return this.request(`/customers/${customerId}/prices/${productId}`, {
      method: 'DELETE',
    });
  }

  async importCustomerPrices(customerId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return fetch(`${this.baseUrl}/customers/${customerId}/prices/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    }).then(res => res.json());
  }

  async exportCustomerPrices(customerId: number) {
    const response = await fetch(`${this.baseUrl}/customers/${customerId}/prices/export`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    return response.blob();
  }

  // Add this method inside the ApiClient class
  async bulkSetCustomerPrices(customerId: number, prices: { productId: number; specificPrice: number }[]) {
    return this.request(`/customers/${customerId}/prices/bulk-set`, {
      method: 'POST',
      body: JSON.stringify({ prices: prices }), // Send in the expected { prices: [...] } wrapper
    });
  }

  // Brand Rules (Refactored from Factory)
  async getBrandRules(customerId: number) {
    return this.request(`/customers/${customerId}/rules`);
  }

  async createBrandRule(customerId: number, data: { brandId: number; size: string; price: number }) {
    return this.request(`/customers/${customerId}/rules`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteBrandRule(customerId: number, ruleId: number) {
    return this.request(`/customers/${customerId}/rules/${ruleId}`, {
      method: 'DELETE',
    });
  }

  // Aliases for compatibility with page.tsx
  async getCustomerRules(customerId: number) {
    return this.getBrandRules(customerId);
  }

  async setCustomerRule(customerId: number, data: { brandId: number; size: string; price: number }) {
    return this.createBrandRule(customerId, data);
  }

  async deleteCustomerRule(customerId: number, ruleId: number) {
    return this.deleteBrandRule(customerId, ruleId);
  }

  async getProductSizes() {
    return this.request('/products/sizes');
  }

  async autoDetectSizes() {
    return this.fixProductMetadata();
  }

  async fixProductMetadata() {
    return this.request('/products/fix-metadata', { method: 'POST' });
  }

  // Price Calculation (Price Waterfall)
  async getProductPrice(productId: number, customerId: number) {
    return this.request(`/pricing/product/${productId}/customer/${customerId}`);
  }

  // Orders
  async getOrders(params?: { status?: string; customerId?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/orders?${query}`);
  }

  async getOrder(id: number) {
    return this.request(`/orders/${id}`);
  }

  async createOrder(data: {
    customerId: number;
    orderType: string;
    warehouseId: number;
    requiredDate?: string;
    notes?: string;
    retailClientName?: string | null;
    shippingAddress?: string | null; // NEW
    clientPhone?: string | null;     // NEW
  }) {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addOrderItem(orderId: number, data: {
    productId: number;
    quantity: number;
    unitId: number;
    unitPrice?: number;
    discountPercent?: number;
    taxPercent?: number;
    palletCount?: number;
    colisCount?: number;
  }) {
    return this.request(`/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOrderStatus(orderId: number, status: string) {
    return this.request(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async finalizeOrder(orderId: number, paymentAmount: number = 0, paymentMethod: 'ESPECE' | 'VIREMENT' | 'CHEQUE' = 'ESPECE') {
    return this.request(`/orders/${orderId}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ paymentAmount, paymentMethod }),
    });
  }

  // --- Gestion des Achats (Purchase Orders) ---

  async getPurchaseOrders(params?: { status?: string; factoryId?: number; page?: number; limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/purchase-orders?${query}`);
  }

  async getPurchaseOrder(id: number) {
    return this.request(`/purchase-orders/${id}`);
  }

  async createPurchaseOrder(data: PurchaseOrderData) {
    return this.request('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Assume getProducts is already sufficient for searching products in the modal

  async getWarehouses() {
    // Basic fetch, add params like search if needed later
    return this.request('/warehouses'); // Requires GET /warehouses endpoint
  }

  async getFactories() {
    // Basic fetch, add params like search if needed later
    return this.request('/factories'); // Requires GET /factories endpoint
  }

  async getGoodsReceipts(params?: { purchaseOrderId?: number; factoryId?: number; page?: number; limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/goods-receipts?${query}`);
  }

  async createGoodsReceipt(data: GoodsReceiptData) {
    return this.request('/goods-receipts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Purchase History ---
  async getPurchaseHistory(params?: { factoryId?: number; startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<{
      factoryid: number;
      factoryname: string;
      totalbought: number;
      totalpaid: number;
      totalleft: number;
      ordercount: number;
    }[]>(`/purchase-orders/history${query}`);
  }

  async getFactoryPurchaseDetails(factoryId: number, params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<{
      factory: { factoryid: number; factoryname: string; contactperson: string; phone: string; email: string };
      orders: {
        purchaseorderid: number;
        ponumber: string;
        orderdate: string;
        status: string;
        totalamount: number;
        ownershiptype: string;
        warehousename: string;
        amountpaid: number;
        amountleft: number;
      }[];
      payments: {
        transactionid: number;
        transactiondate: string;
        amount: number;
        description: string;
        ponumber: string;
      }[];
      totals: { totalBought: number; totalPaid: number; totalLeft: number };
    }>(`/purchase-orders/history/${factoryId}${query}`);
  }

  // Reports
  async getDashboardSummary() {
    return this.request<{
      monthlySales: number;
      pendingOrders: number;
      lowStockItems: number;
      newCustomers: number;
    }>('/reports/dashboard-summary');
  }

  async getClientsBalance() {
    return this.request('/reports/clients-balance');
  }

  async getSuppliersBalance() {
    return this.request('/reports/suppliers-balance');
  }

  // --- Logistics ---

  // Vehicles
  async getVehicles() {
    return this.request('/vehicles');
  }

  async createVehicle(data: any) { return this.request('/vehicles', { method: 'POST', body: JSON.stringify(data) }); }

  async updateVehicle(id: number, data: any) {
    return this.request(`/logistics/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteVehicle(id: number) {
    return this.request(`/logistics/vehicles/${id}`, {
      method: 'DELETE',
    });
  }

  // Drivers
  async getDrivers() {
    return this.request('/drivers');
  }

  async createDriver(data: any) { return this.request('/drivers', { method: 'POST', body: JSON.stringify(data) }); }
  async getPotentialDrivers() { return this.request('/employees/potential-drivers'); }

  async updateDriver(id: number, data: any) {
    return this.request(`/logistics/drivers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDriver(id: number) {
    return this.request(`/logistics/drivers/${id}`, {
      method: 'DELETE',
    });
  }

  // Deliveries
  async getDeliveries() {
    return this.request('/logistics/deliveries');
  }

  async createDelivery(data: {
    orderId: number;
    driverId: number;
    vehicleId: number;
    deliveryDate: string;
    destination?: string;
    notes?: string;
  }) {
    return this.request('/deliveries', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateDeliveryStatus(id: number, status: string) {
    return this.request(`/logistics/deliveries/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  // --- Settlements ---
  async getSettlementFactories() {
    return this.request('/settlements/factories');
  }

  async generateSettlement(data: { factoryId: number; startDate: string; endDate: string }) {
    return this.request('/settlements/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSettlements() {
    return this.request<Settlement[]>('/settlements');
  }

  async updateSettlementStatus(id: number, status: 'PAID'): Promise<ApiResponse<Settlement>> {
    return this.request<Settlement>(`/settlements/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // --- HR Methods ---
  async getEmployees(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/employees');
  }

  async createEmployee(data: any): Promise<ApiResponse<any>> {
    return this.request<any>('/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEmployee(id: number, data: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async clockIn(employeeId: number): Promise<ApiResponse<any>> {
    return this.request<any>('/attendance/clock-in', {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    });
  }

  async clockOut(employeeId: number): Promise<ApiResponse<any>> {
    return this.request<any>('/attendance/clock-out', {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    });
  }

  async getAttendanceHistory(params?: any): Promise<ApiResponse<any[]>> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/attendance${queryString}`);
  }
  // --- Reports ---
  async getEmployeeStats(employeeId: number, params?: { startDate?: string; endDate?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any>(`/reports/employee-stats/${employeeId}?${query}`);
  }

  async getSessionHistory(params?: { userId?: number; limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any[]>(`/reports/sessions?${query}`);
  }

  // --- New Comprehensive Reports ---
  async getSalesReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any>(`/reports/sales${query}`);
  }

  async getPurchasesReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any>(`/reports/purchases${query}`);
  }

  async getFinancialsReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any>(`/reports/financials${query}`);
  }

  async getPaymentsReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any>(`/reports/payments${query}`);
  }

  async getTopProductsReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any[]>(`/reports/top-products${query}`);
  }

  async getProductsDetailReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any[]>(`/reports/products-detail${query}`);
  }

  async getClientsReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any[]>(`/reports/clients${query}`);
  }

  async getTopBrandsReport(params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any[]>(`/reports/top-brands${query}`);
  }

  // --- Accounting (Caisse) ---

  async getCashAccounts() {
    return this.request<any[]>('/accounting/accounts');
  }

  async createCashAccount(data: { accountName: string; description?: string; initialBalance?: number }) {
    return this.request('/accounting/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteCashAccount(id: number) {
    return this.request(`/accounting/accounts/${id}`, { method: 'DELETE' });
  }

  async setDefaultCashAccount(id: number) {
    return this.request(`/accounting/accounts/${id}/default`, { method: 'PUT' });
  }

  async getAccountJournal(id: number, params?: { startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any>(`/accounting/accounts/${id}/journal${query}`);
  }

  async getCashTransactions(params?: {
    accountId?: number;
    transactionType?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    chargeType?: string;
    createdBy?: number;
    limit?: number;
    offset?: number;
  }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any[]>(`/accounting/transactions${query}`);
  }

  async createCashTransaction(data: {
    accountId: number;
    transactionType: string;
    amount: number;
    tiers?: string;
    motif?: string;
    referenceType?: string;
    referenceId?: number;
    chargeType?: string;
    notes?: string;
  }) {
    return this.request('/accounting/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCashSummary(params?: { startDate?: string; endDate?: string; accountId?: number }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any>(`/accounting/summary${query}`);
  }

  async createCashTransfer(data: {
    fromAccountId: number;
    toAccountId: number;
    amount: number;
    motif?: string;
    notes?: string;
  }) {
    return this.request('/accounting/transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Returns ---
  async getReturns(params?: { customerId?: number; status?: string; startDate?: string; endDate?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<any>(`/returns${query}`);
  }

  async getReturnById(id: number) {
    return this.request<any>(`/returns/${id}`);
  }

  async createReturn(data: {
    customerId?: number;
    clientName?: string;
    clientPhone?: string;
    clientAddress?: string;
    orderId?: number;
    reason?: string;
    notes?: string;
    items: Array<{
      productId: number;
      quantity: number;
      unitId?: number;
      unitPrice?: number;
      reason?: string;
    }>;
  }) {
    return this.request('/returns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateReturnStatus(id: number, status: 'PENDING' | 'APPROVED' | 'PROCESSED' | 'REJECTED') {
    return this.request(`/returns/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async deleteReturn(id: number) {
    return this.request(`/returns/${id}`, {
      method: 'DELETE',
    });
  }

  // === Quick Stock Entry ===
  async getQuickStockItems() {
    return this.request('/quick-stock');
  }

  async addQuickStockItem(data: { itemName: string; quantity: number; unitPrice: number }) {
    return this.request('/quick-stock', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateQuickStockItem(id: number, data: { itemName?: string; quantity?: number; unitPrice?: number }) {
    return this.request(`/quick-stock/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteQuickStockItem(id: number) {
    return this.request(`/quick-stock/${id}`, {
      method: 'DELETE',
    });
  }

  async sellQuickStockItem(id: number, data: { quantitySold: number; customerName?: string; customerPhone?: string }) {
    return this.request(`/quick-stock/${id}/sell`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;

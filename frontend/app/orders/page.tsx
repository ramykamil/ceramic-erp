'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DateQuickFilter, DateRange, DateFilterPreset, getDateRange } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';
import { useSortableTable } from '@/hooks/useSortableTable';
import { ResizableSortableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { exportToExcel, formatCurrencyExport, formatDateExport } from '@/lib/exportToExcel';
import VersementsSection from '@/components/versements/VersementsSection';

// Interfaces
interface Order {
  orderid: number;
  ordernumber: string;
  customername: string;
  retailclientname?: string;  // For retail mode orders
  orderdate: string;
  totalamount: number;
  paymentamount?: number;  // Versement
  benefice?: number;  // Bénéfice (profit)
  status: string;
  salespersonname?: string;  // Username of who made the sale
  ordertype?: string; // Added ordertype
}

// Helpers
const formatCurrencyDZD = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);
const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('fr-DZ');
const getStatusBadge = (status: string) => {
  const classes = {
    PENDING: 'bg-amber-100 text-amber-800',
    CONFIRMED: 'bg-blue-100 text-blue-800',
    PROCESSING: 'bg-purple-100 text-purple-800',
    SHIPPED: 'bg-indigo-100 text-indigo-800',
    DELIVERED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };
  return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
};

export default function OrdersListPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'PENDING', 'CONFIRMED', etc.
  const [dateRange, setDateRange] = useState<DateRange>(getDateRange('TODAY'));
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('ALL'); // 'ALL', 'GROS', 'RETAIL'
  const [mainSection, setMainSection] = useState<'COMMANDES' | 'VERSEMENTS'>('COMMANDES');
  const [userRole, setUserRole] = useState('');
  const router = useRouter();

  // Load user role from localStorage
  useEffect(() => {
    const storedRole = localStorage.getItem('user_role');
    if (storedRole) setUserRole(storedRole);
  }, []);

  // Sorting
  const { sortedData, handleSort, getSortDirection } = useSortableTable<Order>(filteredOrders);

  // Resizable columns
  const { widths, handleResize } = useColumnWidths('orders-table', {
    ordernumber: 130,
    customername: 180,
    orderdate: 100,
    totalamount: 120,
    versement: 110,
    benefice: 110,
    status: 100,
    salespersonname: 100,
    ordertype: 80,
  });

  // Debounce search query for server-side search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Re-fetch when server-side filters change
  useEffect(() => {
    fetchOrders();
  }, [activeTab, selectedUserId, orderTypeFilter, debouncedSearch]);

  useEffect(() => {
    // Apply client-side date filter only (search is now server-side)
    let filtered = [...orders];

    // Date Filter
    if (dateRange.startDate || dateRange.endDate) {
      filtered = filtered.filter(order => {
        // Parse the order date and convert to local date string (YYYY-MM-DD)
        const orderDate = new Date(order.orderdate);
        const year = orderDate.getFullYear();
        const month = String(orderDate.getMonth() + 1).padStart(2, '0');
        const day = String(orderDate.getDate()).padStart(2, '0');
        const orderDateStr = `${year}-${month}-${day}`;

        // Compare as strings (YYYY-MM-DD format is sortable)
        if (dateRange.startDate && orderDateStr < dateRange.startDate) return false;
        if (dateRange.endDate && orderDateStr > dateRange.endDate) return false;
        return true;
      });
    }

    setFilteredOrders(filtered);
  }, [orders, dateRange]);

  const handleDelete = async (orderId: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette commande ? (Stock réservé sera libéré)')) return;
    try {
      await api.deleteOrder(orderId);
      fetchOrders(); // Refresh
    } catch (e: any) {
      alert('Erreur chargement: ' + e.message);
    }
  };

  const handleConfirm = async (orderId: number) => {
    if (!window.confirm('Confirmer cette commande ? (Stock sera déduit)')) return;
    try {
      await api.finalizeOrder(orderId); // Uses stored payment info
      fetchOrders(); // Refresh
    } catch (e: any) {
      alert('Erreur confirmation: ' + e.message);
    }
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      // Build params with status, user filter, and server-side search
      const params: any = {};
      if (activeTab !== 'ALL') params.status = activeTab;
      if (selectedUserId) params.salesPersonId = selectedUserId;
      if (orderTypeFilter !== 'ALL') params.orderType = orderTypeFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const response = await api.getOrders(params);
      if (response.success) setOrders((response.data as Order[]) || []);
      else if (response.message?.includes('token')) router.push('/login');
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateFilterChange = (range: DateRange, preset: DateFilterPreset) => {
    setDateRange({
      startDate: range.startDate,
      endDate: range.endDate
    });
  };

  const tabs = [
    { id: 'ALL', label: 'Tout' },
    { id: 'PENDING', label: 'En Attente' },
    { id: 'CONFIRMED', label: 'Confirmé' },
    { id: 'DELIVERED', label: 'Livré' },
    { id: 'CANCELLED', label: 'Annulé' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-7xl mx-auto">

        {/* Main Section Tabs */}
        <div className="mb-6 flex border-b border-slate-300">
          <button
            onClick={() => setMainSection('COMMANDES')}
            className={`px-6 py-3 font-medium text-sm border-b-2 -mb-px transition ${mainSection === 'COMMANDES'
              ? 'border-blue-600 text-blue-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            📦 Commandes
          </button>
          <button
            onClick={() => setMainSection('VERSEMENTS')}
            className={`px-6 py-3 font-medium text-sm border-b-2 -mb-px transition ${mainSection === 'VERSEMENTS'
              ? 'border-blue-600 text-blue-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            💵 Versements
          </button>
        </div>

        {/* Versements Section */}
        {mainSection === 'VERSEMENTS' ? (
          <VersementsSection />
        ) : (
          <>
            {/* Header */}
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-slate-800">Commandes</h1>
                <p className="text-slate-500 text-sm mt-1">Historique des ventes</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    exportToExcel(
                      sortedData,
                      [
                        { key: 'ordernumber', label: 'N° Commande' },
                        { key: 'customername', label: 'Client' },
                        { key: 'orderdate', label: 'Date', format: formatDateExport },
                        { key: 'totalamount', label: 'Total', format: formatCurrencyExport },
                        { key: 'status', label: 'Statut' },
                        { key: 'ordertype', label: 'Type' },
                      ],
                      'commandes',
                      'Commandes'
                    );
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-medium text-xs flex items-center gap-1 shadow-sm"
                  title="Exporter Excel"
                >
                  📄
                </button>
                <Link href="/sales/pos" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-700 flex items-center gap-2 shadow-sm">
                  + Nouvelle Vente
                </Link>
                <Link href="/" className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-50">Retour</Link>
              </div>
            </div>

            {/* Date Quick Filter */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">📅 Filtrer par date:</p>
                  <DateQuickFilter
                    onFilterChange={handleDateFilterChange}
                    defaultPreset="TODAY"
                    showCustom={true}
                  />
                </div>
                <UserFilter
                  onUserChange={setSelectedUserId}
                  label="Vendeur"
                />
                {/* Type Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Type:</span>
                  <select
                    className="border border-slate-300 rounded-md text-sm py-1 px-2 focus:ring-blue-500 focus:border-blue-500"
                    value={orderTypeFilter}
                    onChange={(e) => setOrderTypeFilter(e.target.value)}
                  >
                    <option value="ALL">Tout</option>
                    <option value="GROS">Gros (Wholesale/Consignment)</option>
                    <option value="RETAIL">Détail (Retail)</option>
                  </select>
                </div>
              </div>

              {/* Search Bar */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="relative max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Rechercher par N° Commande ou Client..."
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Status Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${activeTab === tab.id
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
              <span className="ml-auto text-sm text-slate-500 self-center">
                {filteredOrders.length} commande(s)
              </span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <p className="p-10 text-center text-slate-500">Chargement...</p>
              ) : filteredOrders.length === 0 ? (
                <p className="p-10 text-center text-slate-400">Aucune commande trouvée.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-100">
                      <tr>
                        <ResizableSortableHeader label="N° Commande" sortKey="ordernumber" currentDirection={getSortDirection('ordernumber' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.ordernumber} onResize={handleResize} />
                        <ResizableSortableHeader label="Client" sortKey="customername" currentDirection={getSortDirection('customername' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.customername} onResize={handleResize} />
                        <ResizableSortableHeader label="Date" sortKey="orderdate" currentDirection={getSortDirection('orderdate' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.orderdate} onResize={handleResize} />
                        <ResizableSortableHeader label="Total" sortKey="totalamount" currentDirection={getSortDirection('totalamount' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.totalamount} onResize={handleResize} align="right" />
                        <ResizableSortableHeader label="Versement" sortKey="paymentamount" currentDirection={getSortDirection('paymentamount' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.versement} onResize={handleResize} align="right" />
                        {userRole === 'ADMIN' && <ResizableSortableHeader label="Bénéfice" sortKey="benefice" currentDirection={getSortDirection('benefice' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.benefice} onResize={handleResize} align="right" />}
                        <ResizableSortableHeader label="Statut" sortKey="status" currentDirection={getSortDirection('status' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.status} onResize={handleResize} align="center" />
                        <ResizableSortableHeader label="Vendeur" sortKey="salespersonname" currentDirection={getSortDirection('salespersonname' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.salespersonname} onResize={handleResize} />
                        <ResizableSortableHeader label="Type" sortKey="ordertype" currentDirection={getSortDirection('ordertype' as keyof Order)} onSort={(k) => handleSort(k as keyof Order)} width={widths.ordertype} onResize={handleResize} />
                        <th className="px-4 py-3 text-center" style={{ width: 280 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedData.map((order) => (
                        <tr key={order.orderid} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-mono font-medium truncate" style={{ width: widths.ordernumber }}>{order.ordernumber}</td>
                          <td className="px-4 py-3 truncate" style={{ width: widths.customername }}>{order.retailclientname || order.customername || 'Passager'}</td>
                          <td className="px-4 py-3 text-slate-500" style={{ width: widths.orderdate }}>{formatDate(order.orderdate)}</td>
                          <td className="px-4 py-3 text-right font-bold" style={{ width: widths.totalamount }}>{formatCurrencyDZD(parseFloat(String(order.totalamount)) || 0)}</td>
                          <td className="px-4 py-3 text-right text-green-600 font-medium" style={{ width: widths.versement }}>{formatCurrencyDZD(parseFloat(String(order.paymentamount)) || 0)}</td>
                          {userRole === 'ADMIN' && (
                            <td className="px-4 py-3 text-right font-medium" style={{ width: widths.benefice }}>
                              <span className={(parseFloat(String(order.benefice)) || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {formatCurrencyDZD(parseFloat(String(order.benefice)) || 0)}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-center" style={{ width: widths.status }}>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getStatusBadge(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs truncate" style={{ width: widths.salespersonname }}>
                            {order.salespersonname || '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs truncate" style={{ width: widths.ordertype }}>
                            {order.ordertype === 'WHOLESALE' ? 'Gros' : (order.ordertype === 'RETAIL' ? 'Détail' : order.ordertype)}
                          </td>
                          <td className="px-4 py-3 text-center flex gap-1 justify-center items-center" style={{ width: 140 }}>
                            {/* Print Actions Data */}
                            <div className="flex gap-1 mr-2 border-r border-slate-200 pr-2">
                              <a
                                href={`/orders/print/${order.orderid}?type=TICKET`}
                                target="_blank"
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition"
                                title="Imprimer Ticket"
                              >
                                <span className="font-bold text-xs leading-none">🎫</span>
                              </a>
                              <a
                                href={`/orders/print/${order.orderid}?type=DELIVERY_NOTE`}
                                target="_blank"
                                className="p-1.5 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-800 transition"
                                title="Imprimer BL (Bon Livraison)"
                              >
                                <span className="font-bold text-xs leading-none">BL</span>
                              </a>
                              <a
                                href={`/orders/print/${order.orderid}?type=PURCHASE_ORDER`}
                                target="_blank"
                                className="p-1.5 rounded hover:bg-purple-50 text-purple-600 hover:text-purple-800 transition"
                                title="Imprimer BC (Bon Commande)"
                              >
                                <span className="font-bold text-xs leading-none">BC</span>
                              </a>
                              <a
                                href={`/orders/print/${order.orderid}?type=LOADING_SLIP`}
                                target="_blank"
                                className="p-1.5 rounded hover:bg-orange-50 text-orange-600 hover:text-orange-800 transition"
                                title="Imprimer BSS (Bon Sortie Stock)"
                              >
                                <span className="font-bold text-xs leading-none">BSS</span>
                              </a>
                            </div>

                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleConfirm(order.orderid)}
                                className="p-1.5 rounded hover:bg-green-50 text-green-600 hover:text-green-700 transition"
                                title="Confirmer"
                              >
                                <span className="font-bold text-lg leading-none">✓</span>
                              </button>
                            )}
                            {(order.status === 'PENDING' || order.status === 'CONFIRMED' || order.status === 'DELIVERED') && (
                              <Link
                                href={`/sales/pos?editOrderId=${order.orderid}`}
                                className="p-1.5 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition"
                                title="Modifier"
                              >
                                <span className="font-bold text-lg leading-none">✎</span>
                              </Link>
                            )}
                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleDelete(order.orderid)}
                                className="p-1.5 rounded hover:bg-red-50 text-red-600 hover:text-red-700 transition"
                                title="Supprimer"
                              >
                                <span className="font-bold text-lg leading-none">×</span>
                              </button>
                            )}
                            {order.status !== 'PENDING' && (
                              <Link
                                href={`/orders/${order.orderid}`}
                                className="text-blue-600 hover:text-blue-800 font-medium text-xs underline"
                              >
                                Détails
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals Footer - hidden for retail users */}
            {!isLoading && filteredOrders.length > 0 && userRole === 'ADMIN' && (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 shadow-lg z-40 px-4 py-3">
                <div className="max-w-7xl mx-auto">
                  {/* Filtered Totals Row */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
                    <span className="text-xs text-slate-500 font-medium uppercase">Sélection:</span>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Total</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredOrders.reduce((sum, o) => sum + (parseFloat(String(o.totalamount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Versement</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredOrders.reduce((sum, o) => sum + (parseFloat(String(o.paymentamount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Reste</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredOrders.reduce((sum, o) => sum + ((parseFloat(String(o.totalamount)) || 0) - (parseFloat(String(o.paymentamount)) || 0)), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Bénéfice</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredOrders.reduce((sum, o) => sum + (parseFloat(String(o.benefice)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Vente</span>
                      <span className="font-bold text-sm ml-1">{filteredOrders.length}</span>
                    </div>
                  </div>

                  {/* Overall Totals Row (all orders) */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-slate-200">
                    <span className="text-xs text-slate-400 font-medium uppercase">Total Général:</span>
                    <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg border border-blue-200">
                      <span className="text-xs font-medium">Total</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(orders.reduce((sum, o) => sum + (parseFloat(String(o.totalamount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-lg border border-green-200">
                      <span className="text-xs font-medium">Versement</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(orders.reduce((sum, o) => sum + (parseFloat(String(o.paymentamount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 rounded-lg border border-red-200">
                      <span className="text-xs font-medium">Reste</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(orders.reduce((sum, o) => sum + ((parseFloat(String(o.totalamount)) || 0) - (parseFloat(String(o.paymentamount)) || 0)), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200">
                      <span className="text-xs font-medium">Bénéfice</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(orders.reduce((sum, o) => sum + (parseFloat(String(o.benefice)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                      <span className="text-xs font-medium">Vente</span>
                      <span className="font-bold text-sm ml-1">{orders.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Spacer for fixed footer */}
            {!isLoading && filteredOrders.length > 0 && userRole === 'ADMIN' && (
              <div className="h-32"></div>
            )}
          </>
        )}
      </div>
    </div >
  );
}
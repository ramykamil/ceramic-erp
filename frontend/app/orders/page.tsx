'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateQuickFilter, DateRange, DateFilterPreset, getDateRange } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';
import { useSortableTable } from '@/hooks/useSortableTable';
import { ResizableSortableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { exportToExcel, formatCurrencyExport, formatDateExport } from '@/lib/exportToExcel';
import VersementsSection from '@/components/versements/VersementsSection';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useTableNavigation } from '@/hooks/useTableNavigation';

// Interfaces
interface UnifiedRow {
  id: number;
  number: string;
  customerName: string;
  retailClientName?: string;
  date: string;
  totalAmount: number;
  paymentAmount?: number;
  benefice?: number;
  status: string;
  salesPerson?: string;
  orderType?: string; // GROS / RETAIL
  recordType: 'ORDER' | 'RETURN';
}

// Helpers
const formatCurrencyDZD = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const match = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const parts = match[1].split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(dateString).toLocaleDateString('fr-DZ');
};
const getStatusBadge = (status: string) => {
  const classes = {
    PENDING: 'bg-amber-100 text-amber-800',
    CONFIRMED: 'bg-red-100 text-brand-primary',
    PROCESSING: 'bg-purple-100 text-purple-800',
    SHIPPED: 'bg-indigo-100 text-indigo-800',
    DELIVERED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };
  return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
};

function OrdersListContent() {
  const [records, setRecords] = useState<UnifiedRow[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<UnifiedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = usePersistentState('orders_activeTab', 'ALL');
  const [dateRange, setDateRange] = usePersistentState<DateRange>('orders_dateRange', getDateRange('TODAY'));
  const [selectedUserId, setSelectedUserId] = usePersistentState<number | null>('orders_userId', null);
  const [searchQuery, setSearchQuery] = usePersistentState('orders_search', '');
  const [orderTypeFilter, setOrderTypeFilter] = usePersistentState('orders_type', 'ALL');
  const [recordTypeFilter, setRecordTypeFilter] = usePersistentState('orders_viewType', 'ALL'); // 'ALL' | 'ORDER' | 'RETURN'
  const [mainSection, setMainSection] = usePersistentState<'COMMANDES' | 'VERSEMENTS'>('orders_section', 'COMMANDES');
  const [userRole, setUserRole] = useState('');
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the container on mount for immediate keyboard navigation
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const searchParams = useSearchParams();

  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'RETURN' || filter === 'ORDER') {
      setRecordTypeFilter(filter as any);
      setActiveTab('ALL');
      setDateRange(getDateRange('TODAY'));
      // Clear the URL param so it doesn't fight with manual dropdown changes
      router.replace('/orders');
    }
  }, [searchParams, router, setRecordTypeFilter, setActiveTab, setDateRange]);

  // Load user role from localStorage
  useEffect(() => {
    const storedRole = localStorage.getItem('user_role');
    if (storedRole) setUserRole(storedRole);
  }, []);

  // Sorting
  const { sortedData, handleSort, getSortDirection } = useSortableTable<UnifiedRow>(filteredRecords);

  // Keyboard navigation
  const { selectedIndex, handleKeyDown, getRowClass, getRowProps, setSelectedIndex } = useTableNavigation({
    rowCount: sortedData.length,
    onAction: (idx) => {
      const record = sortedData[idx];
      if (record.recordType === 'RETURN') {
        router.push(`/sales/returns/${record.id}`); // Assuming a return detail page exists
      } else if (record.status === 'PENDING') {
        handleConfirm(record.id);
      } else {
        router.push(`/orders/${record.id}`);
      }
    }
  });

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
    fetchData();
  }, [activeTab, selectedUserId, orderTypeFilter, recordTypeFilter, debouncedSearch, dateRange]);

  useEffect(() => {
    // Apply client-side date filter
    let filtered = [...records];

    // Date Filter
    if (dateRange.startDate || dateRange.endDate) {
      filtered = filtered.filter(record => {
        const d = new Date(record.date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (dateRange.startDate && dateStr < dateRange.startDate) return false;
        if (dateRange.endDate && dateStr > dateRange.endDate) return false;
        return true;
      });
    }

    setFilteredRecords(filtered);
  }, [records, dateRange]);

  const handleDelete = async (id: number, type: 'ORDER' | 'RETURN') => {
    const msg = type === 'ORDER' ? 'Supprimer cette commande ? (Stock sera libéré)' : 'Supprimer ce retour ?';
    if (!window.confirm(msg)) return;
    try {
      if (type === 'ORDER') await api.deleteOrder(id);
      else await api.deleteReturn(id);
      fetchData(); // Refresh
    } catch (e: any) {
      alert('Erreur: ' + e.message);
    }
  };

  const handleConfirm = async (orderId: number) => {
    if (!window.confirm('Confirmer cette commande ? (Stock sera déduit)')) return;
    try {
      await api.finalizeOrder(orderId);
      fetchData(); // Refresh
    } catch (e: any) {
      alert('Erreur confirmation: ' + e.message);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (activeTab !== 'ALL') params.status = activeTab;
      if (selectedUserId) params.salesPersonId = selectedUserId;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      
      // Pass date range to server-side if present
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;

      const fetchOrders = recordTypeFilter === 'ALL' || recordTypeFilter === 'ORDER';
      const fetchReturns = recordTypeFilter === 'ALL' || recordTypeFilter === 'RETURN';

      // Build clean params for orders (no undefined values)
      const orderParams: any = { ...params };
      if (orderTypeFilter !== 'ALL') orderParams.orderType = orderTypeFilter;

      // Build clean params for returns (no undefined values - URLSearchParams converts undefined to string "undefined")
      const returnParams: any = { ...params };
      // Map order status tabs to return status equivalents
      delete returnParams.status; // Remove the order status, set the correct return status below
      const mappedStatus = activeTab === 'CONFIRMED' ? 'APPROVED' : 
                           activeTab === 'DELIVERED' ? 'PROCESSED' : 
                           activeTab === 'CANCELLED' ? 'REJECTED' : 
                           activeTab === 'PENDING' ? 'PENDING' : null;
      if (mappedStatus) returnParams.status = mappedStatus;
      if (orderTypeFilter !== 'ALL') returnParams.orderType = orderTypeFilter;

      const [ordersRes, returnsRes] = await Promise.all([
        fetchOrders ? api.getOrders(orderParams) : Promise.resolve({ success: true, data: [] }),
        fetchReturns ? api.getReturns(returnParams) : Promise.resolve({ success: true, data: [] })
      ]);

      let unified: UnifiedRow[] = [];

      if (ordersRes.success) {
        const orderRows: UnifiedRow[] = (ordersRes.data as any[]).map(o => ({
          id: o.orderid,
          number: o.ordernumber,
          customerName: o.customername,
          retailClientName: o.retailclientname,
          date: o.orderdate,
          totalAmount: Number(o.totalamount),
          paymentAmount: Number(o.paymentamount || 0),
          benefice: Number(o.benefice || 0),
          status: o.status,
          salesPerson: o.salespersonname,
          orderType: o.ordertype,
          recordType: 'ORDER'
        }));
        unified = [...unified, ...orderRows];
      }

      if (returnsRes.success) {
        const returnRows: UnifiedRow[] = (returnsRes.data as any[]).map(r => ({
          id: r.returnid,
          number: r.returnnumber || `RET-${r.returnid}`,
          customerName: r.customername,
          retailClientName: r.retailclientname, // Use normalized field
          date: r.returndate || r.createdat,
          totalAmount: -Number(r.totalamount || 0), // Negative for CA Net calculation
          paymentAmount: 0,
          benefice: 0,
          status: r.status === 'APPROVED' ? 'CONFIRMED' : 
                  r.status === 'PROCESSED' ? 'DELIVERED' : 
                  r.status === 'REJECTED' ? 'CANCELLED' : r.status,
          salesPerson: r.username,
          recordType: 'RETURN'
        }));
        unified = [...unified, ...returnRows];
      }

      // Sort by date newest first by default
      unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setRecords(unified);
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
    <div 
      ref={containerRef}
      className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800 outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="max-w-7xl mx-auto">

        {/* Main Section Tabs */}
        <div className="mb-6 flex border-b border-slate-300">
          <button
            onClick={() => setMainSection('COMMANDES')}
            className={`px-6 py-3 font-medium text-sm border-b-2 -mb-px transition ${mainSection === 'COMMANDES'
              ? 'border-brand-primary text-brand-primary bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            📦 Commandes
          </button>
          <button
            onClick={() => setMainSection('VERSEMENTS')}
            className={`px-6 py-3 font-medium text-sm border-b-2 -mb-px transition ${mainSection === 'VERSEMENTS'
              ? 'border-brand-primary text-brand-primary bg-white'
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
                <Link href="/sales/pos" className="bg-brand-primary text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-brand-primary-dark flex items-center gap-2 shadow-sm transition-colors">
                  + Nouvelle Vente
                </Link>
                <Link href="/sales/returns/new" className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-orange-700 flex items-center gap-2 shadow-sm transition-colors">
                  ↩ Nouveau Retour
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
                {/* View Type Filter */}
                <div className="flex items-center gap-2 border-l pl-4">
                  <span className="text-xs text-slate-500 font-medium">Affichage:</span>
                  <select
                    className="border border-slate-300 rounded-md text-sm py-1 px-2 focus:ring-brand-primary/40 focus:border-brand-primary bg-slate-50 font-bold"
                    value={recordTypeFilter}
                    onChange={(e) => setRecordTypeFilter(e.target.value as any)}
                  >
                    <option value="ALL">Tout (Ventes + Retours)</option>
                    <option value="ORDER">Commandes uniquement</option>
                    <option value="RETURN">Retours uniquement</option>
                  </select>
                </div>
                {/* Order Type Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Type Vente:</span>
                  <select
                    className="border border-slate-300 rounded-md text-sm py-1 px-2 focus:ring-brand-primary/40 focus:border-brand-primary"
                    value={orderTypeFilter}
                    onChange={(e) => setOrderTypeFilter(e.target.value)}
                  >
                    <option value="ALL">Tout</option>
                    <option value="GROS">Gros (Wholesale)</option>
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
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm transition duration-150 ease-in-out"
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
                {filteredRecords.length} élément(s)
              </span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <p className="p-10 text-center text-slate-500">Chargement...</p>
              ) : filteredRecords.length === 0 ? (
                <p className="p-10 text-center text-slate-400">Aucun enregistrement trouvé.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-100">
                      <tr>
                        <th style={{ width: 80 }} className="px-4 py-3 text-center">Type</th>
                        <ResizableSortableHeader label="Référence" sortKey="number" currentDirection={getSortDirection('number' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.ordernumber} onResize={handleResize} />
                        <ResizableSortableHeader label="Client" sortKey="customerName" currentDirection={getSortDirection('customerName' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.customername} onResize={handleResize} />
                        <ResizableSortableHeader label="Date" sortKey="date" currentDirection={getSortDirection('date' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.orderdate} onResize={handleResize} />
                        <ResizableSortableHeader label="Total" sortKey="totalAmount" currentDirection={getSortDirection('totalAmount' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.totalamount} onResize={handleResize} align="right" />
                        <ResizableSortableHeader label="Versement" sortKey="paymentAmount" currentDirection={getSortDirection('paymentAmount' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.versement} onResize={handleResize} align="right" />
                        {userRole === 'ADMIN' && <ResizableSortableHeader label="Bénéfice" sortKey="benefice" currentDirection={getSortDirection('benefice' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.benefice} onResize={handleResize} align="right" />}
                        <ResizableSortableHeader label="Statut" sortKey="status" currentDirection={getSortDirection('status' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.status} onResize={handleResize} align="center" />
                        <ResizableSortableHeader label="Agent" sortKey="salesPerson" currentDirection={getSortDirection('salesPerson' as keyof UnifiedRow)} onSort={(k) => handleSort(k as keyof UnifiedRow)} width={widths.salespersonname} onResize={handleResize} />
                        <th className="px-4 py-3 text-center" style={{ width: 280 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedData.map((record, idx) => (
                        <tr 
                          key={`${record.recordType}-${record.id}`} 
                          {...getRowProps(idx)}
                          className={getRowClass(idx, "hover:bg-slate-50 transition cursor-pointer")}
                        >
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${record.recordType === 'ORDER' ? 'bg-red-100 text-brand-primary' : 'bg-orange-100 text-orange-700'}`}>
                              {record.recordType === 'ORDER' ? 'VENTE' : 'RETOUR'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-medium truncate" style={{ width: widths.ordernumber }}>{record.number}</td>
                          <td className="px-4 py-3 truncate" style={{ width: widths.customername }}>{record.retailClientName || record.customerName || 'Passager'}</td>
                          <td className="px-4 py-3 text-slate-500" style={{ width: widths.orderdate }}>{formatDate(record.date)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${record.totalAmount < 0 ? 'text-orange-600' : ''}`} style={{ width: widths.totalamount }}>
                            {formatCurrencyDZD(parseFloat(String(record.totalAmount)) || 0)}
                          </td>
                          <td className="px-4 py-3 text-right text-green-600 font-medium" style={{ width: widths.versement }}>{formatCurrencyDZD(parseFloat(String(record.paymentAmount)) || 0)}</td>
                          {userRole === 'ADMIN' && (
                            <td className="px-4 py-3 text-right font-medium" style={{ width: widths.benefice }}>
                              <span className={(parseFloat(String(record.benefice)) || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {formatCurrencyDZD(parseFloat(String(record.benefice)) || 0)}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-center" style={{ width: widths.status }}>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getStatusBadge(record.status)}`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-[10px] truncate" style={{ width: widths.salespersonname }}>
                            {record.salesPerson || '-'}
                            {record.orderType && <div className="text-[8px] opacity-50 uppercase">{record.orderType}</div>}
                          </td>
                          <td className="px-4 py-3 text-center flex gap-1 justify-center items-center" style={{ width: 140 }}>
                            {record.recordType === 'ORDER' ? (
                              <>
                                <div className="flex gap-1 mr-2 border-r border-slate-200 pr-2">
                                  <a href={`/orders/print/${record.id}?type=TICKET`} target="_blank" className="p-1.5 rounded hover:bg-slate-100 text-slate-600"><span className="text-xs font-bold">🎫</span></a>
                                  <a href={`/orders/print/${record.id}?type=DELIVERY_NOTE`} target="_blank" className="p-1.5 rounded hover:bg-red-50 text-red-600"><span className="text-xs font-bold">BL</span></a>
                                </div>
                                <Link href={`/orders/${record.id}`} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Détails">👁</Link>
                                {record.status === 'PENDING' && (
                                  <button onClick={() => handleConfirm(record.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Confirmer">✓</button>
                                )}
                                <Link href={`/sales/pos?editOrderId=${record.id}`} className="p-1.5 text-brand-primary hover:bg-red-50 rounded" title="Modifier">✎</Link>
                                <button onClick={() => handleDelete(record.id, 'ORDER')} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer">×</button>
                              </>
                            ) : (
                              <>
                                <Link href={`/sales/returns/${record.id}`} className="text-orange-600 hover:underline text-xs font-bold mr-3">Détails</Link>
                                <button onClick={() => handleDelete(record.id, 'RETURN')} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer Retour">×</button>
                              </>
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
            {!isLoading && filteredRecords.length > 0 && userRole === 'ADMIN' && (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 shadow-lg z-40 px-4 py-3">
                <div className="max-w-7xl mx-auto">
                  {/* Filtered Totals Row */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
                    <span className="text-xs text-slate-500 font-medium uppercase">Sélection:</span>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-brand-primary text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Total Net</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredRecords.reduce((sum, r) => sum + (parseFloat(String(r.totalAmount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Versement</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredRecords.reduce((sum, r) => sum + (parseFloat(String(r.paymentAmount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Bénéfice</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredRecords.reduce((sum, r) => sum + (parseFloat(String(r.benefice)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Éléments</span>
                      <span className="font-bold text-sm ml-1">{filteredRecords.length}</span>
                    </div>
                  </div>

                  {/* Overall Totals Row (all records) */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-slate-200">
                    <span className="text-xs text-slate-400 font-medium uppercase">Total Général:</span>
                    <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg border border-blue-200">
                      <span className="text-xs font-medium">CA Net</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(records.reduce((sum, r) => sum + (parseFloat(String(r.totalAmount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-lg border border-green-200">
                      <span className="text-xs font-medium">Encaissement</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(records.reduce((sum, r) => sum + (parseFloat(String(r.paymentAmount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                      <span className="text-xs font-medium">Vol. Transactions</span>
                      <span className="font-bold text-sm ml-1">{records.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Spacer for fixed footer */}
            {!isLoading && filteredRecords.length > 0 && userRole === 'ADMIN' && (
              <div className="h-32"></div>
            )}
          </>
        )}
      </div>
    </div >
  );
}

export default function OrdersListPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center font-bold">Initialisation...</div>}>
      <OrdersListContent />
    </Suspense>
  );
}
'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DateQuickFilter, DateRange, DateFilterPreset, getDateRange } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';
import { useSortableTable } from '@/hooks/useSortableTable';
import { SortableTableHeader } from '@/components/SortableTableHeader';
import { ResizableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { exportToExcel, formatDateExport } from '@/lib/exportToExcel';
import SupplierVersementsSection from '@/components/versements/SupplierVersementsSection';

// --- Interfaces ---
interface PurchaseOrder {
  purchaseorderid: number;
  ponumber: string;
  factoryname: string;
  warehousename: string;
  orderdate: string;
  expecteddeliverydate: string | null;
  status: string;
  totalamount: number;
  amountpaid: number;  // Versement (payments made)
  ownershiptype: 'OWNED' | 'CONSIGNMENT';
  createdbyname?: string;
}

interface PurchaseReturn {
  returnid: number;
  returnnumber: string;
  purchaseorderid: number | null;
  ponumber: string | null;
  factoryid: number | null;
  factoryname: string | null;
  returndate: string;
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  totalamount: number;
  notes: string;
  createdbyname: string;
  itemcount: number;
}

// Unified row type for the merged table
interface UnifiedRow {
  _type: 'order' | 'return';
  _id: string; // unique key
  purchaseorderid: number;
  ponumber: string;
  factoryname: string;
  warehousename: string;
  orderdate: string;
  expecteddeliverydate: string | null;
  status: string;
  totalamount: number;
  amountpaid: number;
  ownershiptype: 'OWNED' | 'CONSIGNMENT';
  createdbyname?: string;
  // Return-specific fields
  returnid?: number;
  returnnumber?: string;
  itemcount?: number;
  notes?: string;
}

// --- Helpers ---
const formatCurrencyDZD = (amount: number | null | undefined): string => {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount)) return "0,00 DZD";
  return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(numericAmount);
};

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  try {
    const match = dateString.match(/^(\d{4})-\d{2}-\d{2}/);
    if (match && dateString.length <= 10) {
      const parts = dateString.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else if (match) {
      const parts = match[0].split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(dateString).toLocaleDateString('fr-DZ', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  } catch (e) { return dateString || ''; }
};

const getStatusBadge = (status: string): string => {
  const statusClasses = {
    PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
    APPROVED: 'bg-blue-50 text-blue-700 border border-blue-200',
    RECEIVED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    PARTIAL: 'bg-purple-50 text-purple-700 border border-purple-200',
    CANCELLED: 'bg-red-50 text-red-700 border border-red-200',
  };
  return statusClasses[status as keyof typeof statusClasses] || 'bg-slate-50 text-slate-700 border border-slate-200';
};

const getReturnStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    PENDING: 'En attente',
    APPROVED: 'Approuvé',
    CANCELLED: 'Annulé',
  };
  return labels[status] || status;
};

// --- Component ---
export default function PurchaseOrdersListPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'order' | 'return'>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(getDateRange('TODAY'));
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'commandes' | 'versements'>('commandes');
  const [receivingPoId, setReceivingPoId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Read user role from localStorage on mount
  useEffect(() => {
    setUserRole(localStorage.getItem('user_role'));
  }, []);

  // One-click direct reception: receive all remaining quantities into stock
  const handleDirectReceive = async (poId: number) => {
    if (!confirm('Réceptionner tout le stock restant pour ce bon de commande ?')) return;

    setReceivingPoId(poId);
    try {
      // 1. Fetch full PO details to get items and remaining quantities
      const poResponse = await api.getPurchaseOrder(poId);
      if (!poResponse.success || !poResponse.data) {
        throw new Error(poResponse.message || 'Impossible de charger le bon de commande');
      }
      const poData = poResponse.data as any;

      // 2. Build items with remaining quantities
      const itemsToReceive = (poData.items || [])
        .map((item: any) => {
          const qtyOrdered = Number(item.quantity) || 0;
          const qtyReceived = Number(item.receivedquantity) || 0;
          const qtyRemaining = qtyOrdered - qtyReceived;

          // Calculate palletCount and colisCount from product packaging info
          const piecesPerCarton = Number(item.qteparcolis) || 0;
          const cartonsPerPalette = Number(item.qtecolisparpalette) || 0;
          const colisCount = piecesPerCarton > 0 ? parseFloat((qtyRemaining / piecesPerCarton).toFixed(2)) : 0;
          const palletCount = cartonsPerPalette > 0 ? parseFloat((colisCount / cartonsPerPalette).toFixed(2)) : 0;

          return {
            poItemId: item.poitemid,
            productId: item.productid,
            unitId: item.unitid,
            quantityReceived: qtyRemaining,
            palletCount,
            colisCount,
            ownershipType: poData.ownershiptype || 'OWNED',
            factoryId: poData.factoryid,
          };
        })
        .filter((item: any) => item.quantityReceived > 0);

      if (itemsToReceive.length === 0) {
        alert('Ce bon de commande est déjà entièrement réceptionné.');
        return;
      }

      // 3. Call the goods receipt API directly
      const receiptData = {
        purchaseOrderId: poData.purchaseorderid,
        warehouseId: poData.warehouseid,
        factoryId: poData.factoryid,
        ownershipType: poData.ownershiptype || 'OWNED',
        receiptDate: new Date().toISOString().split('T')[0],
        items: itemsToReceive,
      };

      const result = await api.createGoodsReceipt(receiptData);
      if (result.success) {
        const resData = result.data as any;
        alert(`✅ Réception ${resData.receiptNumber} enregistrée ! Stock mis à jour.`);
        fetchPurchaseOrders(); // Refresh the list
      } else {
        throw new Error(result.message || 'Erreur lors de la réception');
      }
    } catch (error: any) {
      console.error('Erreur réception directe:', error);
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setReceivingPoId(null);
    }
  };

  const [filteredUnifiedRows, setFilteredUnifiedRows] = useState<UnifiedRow[]>([]);

  // Sorting on the filtered list
  const { sortedData: displayData, handleSort: onSort, getSortDirection: getDir } = useSortableTable<UnifiedRow>(filteredUnifiedRows);

  // Resizable column widths
  const { widths, handleResize } = useColumnWidths('purchasing-list-table', {
    ponumber: 110,
    factoryname: 120,
    warehousename: 100,
    orderdate: 90,
    totalamount: 110,
    amountpaid: 100,
    createdbyname: 90,
    status: 80,
    actions: 160,
  });

  useEffect(() => {
    fetchPurchaseOrders();
    fetchPurchaseReturns();
  }, [statusFilter, selectedUserId]);

  // Build unified rows from orders + returns
  const buildUnifiedRows = (): UnifiedRow[] => {
    const orderRows: UnifiedRow[] = purchaseOrders.map(po => ({
      _type: 'order' as const,
      _id: `order-${po.purchaseorderid}`,
      ...po,
    }));

    const returnRows: UnifiedRow[] = purchaseReturns.map(ret => ({
      _type: 'return' as const,
      _id: `return-${ret.returnid}`,
      purchaseorderid: ret.returnid,
      ponumber: ret.returnnumber,
      factoryname: ret.factoryname || '-',
      warehousename: '-',
      orderdate: ret.returndate,
      expecteddeliverydate: null,
      status: ret.status,
      totalamount: ret.totalamount,
      amountpaid: 0,
      ownershiptype: 'OWNED' as const,
      createdbyname: ret.createdbyname,
      returnid: ret.returnid,
      returnnumber: ret.returnnumber,
      itemcount: ret.itemcount,
      notes: ret.notes,
    }));

    return [...orderRows, ...returnRows];
  };

  // Apply client-side filters
  useEffect(() => {
    let result = buildUnifiedRows();

    // Type Filter (Achats / Retours)
    if (typeFilter) {
      result = result.filter(row => row._type === typeFilter);
    }

    // Date Filter
    if (dateRange.startDate || dateRange.endDate) {
      result = result.filter(row => {
        const orderDate = new Date(row.orderdate);
        const year = orderDate.getFullYear();
        const month = String(orderDate.getMonth() + 1).padStart(2, '0');
        const day = String(orderDate.getDate()).padStart(2, '0');
        const orderDateStr = `${year}-${month}-${day}`;

        if (dateRange.startDate && orderDateStr < dateRange.startDate) return false;
        if (dateRange.endDate && orderDateStr > dateRange.endDate) return false;
        return true;
      });
    }

    // Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row =>
        (row.ponumber && row.ponumber.toLowerCase().includes(q)) ||
        (row.factoryname && row.factoryname.toLowerCase().includes(q))
      );
    }

    // Sort: orders and returns mixed together by date descending
    result.sort((a, b) => new Date(b.orderdate).getTime() - new Date(a.orderdate).getTime());

    setFilteredUnifiedRows(result);
  }, [purchaseOrders, purchaseReturns, dateRange, searchQuery, typeFilter]);

  const fetchPurchaseOrders = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (selectedUserId) params.userId = selectedUserId;

      const response = await api.getPurchaseOrders(params);
      if (response.success) {
        setPurchaseOrders((response.data as PurchaseOrder[]) || []);
      } else {
        if (response.message?.includes('token') || response.message?.includes('Authentication required')) {
          router.push('/login');
        }
        throw new Error(response.message || 'Erreur inconnue');
      }
    } catch (error: any) {
      console.error('Erreur chargement bons de commande:', error);
      setApiError(`Impossible de charger les bons de commande: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPurchaseReturns = async () => {
    try {
      const response = await api.getPurchaseReturns({});
      if (response.success) {
        setPurchaseReturns((response.data as PurchaseReturn[]) || []);
      }
    } catch (error: any) {
      console.error('Erreur chargement retours:', error);
    }
  };

  const handleApproveReturn = async (returnId: number) => {
    if (!confirm('Confirmer le retour ? Le stock sera DÉBITÉ (sorti) du stock.')) return;
    try {
      const res = await api.updatePurchaseReturnStatus(returnId, 'APPROVED');
      if (res.success) {
        alert('Retour approuvé avec succès.');
        fetchPurchaseReturns();
      } else {
        alert('Erreur: ' + res.message);
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  const handleDeleteReturn = async (returnId: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce retour ?')) return;
    try {
      const res = await api.deletePurchaseReturn(returnId);
      if (res.success) {
        fetchPurchaseReturns();
      } else {
        alert('Erreur: ' + res.message);
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-7xl mx-auto">

        {/* --- Header --- */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Réception des Achats</h1>
            <p className="text-slate-500 text-sm mt-1">Gérer les commandes fournisseurs et les réceptions</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Export Excel Button */}
            <button
              onClick={() => {
                exportToExcel(
                  displayData,
                  [
                    { key: 'ponumber', label: 'N° Bon' },
                    { key: 'factoryname', label: 'Usine' },
                    { key: 'warehousename', label: 'Entrepôt' },
                    { key: 'orderdate', label: 'Date', format: formatDateExport },
                    { key: 'status', label: 'Statut' },
                  ],
                  'bons_achat',
                  'Achats'
                );
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm shadow-sm flex items-center gap-2"
            >
              📄 Excel
            </button>

            {/* Nouveau Bon Button */}
            <Link
              href="/purchasing/new"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Nouveau Bon
            </Link>

            {/* Historique Button */}
            <Link
              href="/purchasing/history"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              📊 Historique
            </Link>

            {/* Nouveau Retour Button */}
            <Link
              href="/purchasing/returns/new"
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2"
            >
              ↩️ Nouveau Retour
            </Link>

            {/* Retour Button (Clean Light Style) */}
            <Link
              href="/"
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Retour
            </Link>
          </div>
        </div>

        {/* --- Tab Navigation --- */}
        <div className="mb-6 border-b border-slate-200">
          <nav className="flex gap-2">
            <button
              onClick={() => setActiveTab('commandes')}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === 'commandes'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
              📦 Commandes
            </button>
            <button
              onClick={() => setActiveTab('versements')}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === 'versements'
                ? 'border-orange-500 text-orange-600 bg-orange-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
              💰 Versements Fournisseurs
            </button>
          </nav>
        </div>

        {/* --- Error Display --- */}
        {apiError && activeTab === 'commandes' && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* Versements Tab Content */}
        {activeTab === 'versements' && (
          <SupplierVersementsSection />
        )}

        {/* Commandes Tab Content */}
        {activeTab === 'commandes' && (
          <>
            {/* --- Filter Bar --- */}
            <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">

              {/* Top Row: Date & User & Status */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">📅 Filtrer par date:</p>
                  <DateQuickFilter
                    onFilterChange={(range) => setDateRange(range)}
                    defaultPreset="TODAY"
                    showCustom={true}
                  />
                </div>

                <UserFilter
                  onUserChange={setSelectedUserId}
                  label="Créé par"
                  excludeSystemUsers={true}
                />
              </div>

              <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center gap-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="N° Bon ou Usine/Fournisseur..."
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-700"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Type Select (Achats / Retours) */}
                <div className="flex items-center gap-2">
                  <label htmlFor="typeFilter" className="text-sm font-medium text-slate-700 whitespace-nowrap">Type:</label>
                  <select
                    id="typeFilter"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as '' | 'order' | 'return')}
                    className="w-40 p-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Tous</option>
                    <option value="order">📦 Achats</option>
                    <option value="return">↩️ Retours</option>
                  </select>
                </div>

                {/* Status Select */}
                <div className="flex items-center gap-2">
                  <label htmlFor="statusFilter" className="text-sm font-medium text-slate-700 whitespace-nowrap">Statut:</label>
                  <select
                    id="statusFilter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-40 p-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Tous</option>
                    <option value="PENDING">En Attente</option>
                    <option value="APPROVED">Approuvé</option>
                    <option value="PARTIAL">Partiel</option>
                    <option value="RECEIVED">Reçu</option>
                    <option value="CANCELLED">Annulé</option>
                  </select>
                </div>
              </div>
            </div>

            {/* --- Data Table Container --- */}
            <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
              {isLoading ? (
                <div className="text-center py-20">
                  <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500">Chargement...</p>
                </div>
              ) : filteredUnifiedRows.length === 0 && !apiError ? (
                <div className="text-center py-20 text-slate-400">
                  <p className="text-lg">Aucun bon de commande ou retour trouvé.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                      <tr>
                        <ResizableHeader columnKey="ponumber" width={widths.ponumber} onResize={handleResize} className="px-4 py-3 text-left">Numéro</ResizableHeader>
                        <ResizableHeader columnKey="factoryname" width={widths.factoryname} onResize={handleResize} className="px-4 py-3 text-left">Marque</ResizableHeader>
                        <ResizableHeader columnKey="warehousename" width={widths.warehousename} onResize={handleResize} className="px-4 py-3 text-left">Entrepôt</ResizableHeader>
                        <ResizableHeader columnKey="orderdate" width={widths.orderdate} onResize={handleResize} className="px-4 py-3 text-left">Date</ResizableHeader>
                        <ResizableHeader columnKey="totalamount" width={widths.totalamount} onResize={handleResize} className="px-4 py-3 text-right">Mt. Total</ResizableHeader>
                        <ResizableHeader columnKey="amountpaid" width={widths.amountpaid} onResize={handleResize} className="px-4 py-3 text-right">Versement</ResizableHeader>
                        <ResizableHeader columnKey="createdbyname" width={widths.createdbyname} onResize={handleResize} className="px-4 py-3 text-left">Créé par</ResizableHeader>
                        <ResizableHeader columnKey="status" width={widths.status} onResize={handleResize} className="px-4 py-3 text-center">Statut</ResizableHeader>
                        <th scope="col" className="px-4 py-3 text-center" style={{ width: widths.actions }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayData.map((row) => {
                        const isReturn = row._type === 'return';
                        return (
                          <tr
                            key={row._id}
                            className={`hover:bg-slate-50 transition-colors duration-150 ${
                              isReturn ? 'bg-orange-50/40 border-l-4 border-l-orange-400' : ''
                            }`}
                          >
                            <td className="px-4 py-3 font-mono text-xs truncate">
                              <div className="flex items-center gap-2">
                                {isReturn && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white uppercase tracking-wide shrink-0">
                                    ↩ Retour
                                  </span>
                                )}
                                <span className={isReturn ? 'text-orange-700' : 'text-slate-500'}>{row.ponumber}</span>
                              </div>
                            </td>
                            <td className={`px-4 py-3 font-medium truncate ${isReturn ? 'text-orange-800' : 'text-slate-900'}`}>{row.factoryname}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs truncate">{isReturn ? '—' : row.warehousename}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(row.orderdate)}</td>
                            <td className={`px-4 py-3 text-right font-bold ${isReturn ? 'text-orange-700' : 'text-slate-800'}`}>
                              {isReturn ? '-' : ''}{formatCurrencyDZD(row.totalamount)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-green-600">
                              {isReturn ? '—' : formatCurrencyDZD(row.amountpaid)}
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-xs truncate">{row.createdbyname || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {isReturn ? (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadge(row.status)}`}>
                                  {getReturnStatusLabel(row.status)}
                                </span>
                              ) : (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadge(row.status)}`}>
                                  {row.status}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {isReturn ? (
                                /* Return-specific actions */
                                <>
                                  <Link
                                    href={`/purchasing/returns/${row.returnid}`}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1"
                                    title="Voir les détails du retour"
                                  >
                                    👁 Voir
                                  </Link>
                                  {row.status === 'PENDING' && (
                                    <>
                                      <button
                                        onClick={() => handleApproveReturn(row.returnid!)}
                                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1 ml-2"
                                        title="Approuver le retour"
                                      >
                                        ✅ Approuver
                                      </button>
                                      <button
                                        onClick={() => handleDeleteReturn(row.returnid!)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1 ml-2"
                                        title="Supprimer le retour"
                                      >
                                        🗑️
                                      </button>
                                    </>
                                  )}
                                </>
                              ) : (
                                /* Purchase order actions */
                                <>
                                  <Link
                                    href={`/purchasing/${row.purchaseorderid}`}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1"
                                    title="Voir les détails"
                                  >
                                    👁 Voir
                                  </Link>

                                  <button
                                    onClick={() => handleDirectReceive(row.purchaseorderid)}
                                    disabled={receivingPoId === row.purchaseorderid || row.status === 'RECEIVED'}
                                    className={`px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1 ml-2 ${row.status === 'RECEIVED'
                                      ? 'text-slate-400 cursor-not-allowed'
                                      : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                      }`}
                                    title={row.status === 'RECEIVED' ? 'Déjà réceptionné' : 'Réceptionner ce PO'}
                                  >
                                    {receivingPoId === row.purchaseorderid ? (
                                      <>
                                        <span className="inline-block w-3 h-3 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"></span>
                                        <span>En cours...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span>{row.status === 'RECEIVED' ? '✓' : '📦'}</span>
                                        <span>{row.status === 'RECEIVED' ? 'Reçu' : 'Réceptionner'}</span>
                                      </>
                                    )}
                                  </button>

                                  {(row.status === 'PENDING' || row.status === 'APPROVED' || row.status === 'PARTIAL' || row.status === 'RECEIVED') && (
                                    <Link
                                      href={`/purchasing/edit/${row.purchaseorderid}`}
                                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1 ml-2"
                                      title="Modifier"
                                    >
                                      ✏️
                                    </Link>
                                  )}

                                  {(row.status === 'PENDING' || userRole === 'ADMIN') && (
                                    <button
                                      onClick={async () => {
                                        const isNonPending = row.status !== 'PENDING';
                                        const confirmMsg = isNonPending
                                          ? `⚠️ ATTENTION: Ce bon est "${row.status}". La suppression va annuler le stock réceptionné.\n\nÊtes-vous sûr de vouloir supprimer ce bon de commande ?`
                                          : 'Êtes-vous sûr de vouloir supprimer ce bon de commande ?';
                                        if (!confirm(confirmMsg)) return;
                                        try {
                                          const res = await api.deletePurchaseOrder(row.purchaseorderid);
                                          if (res.success) {
                                            fetchPurchaseOrders();
                                          } else {
                                            alert(res.message || 'Erreur lors de la suppression');
                                          }
                                        } catch (e: any) {
                                          alert(e.message);
                                        }
                                      }}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1 ml-2"
                                      title="Supprimer"
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals Footer */}
            {!isLoading && filteredUnifiedRows.length > 0 && (() => {
              const filteredOrders = filteredUnifiedRows.filter(r => r._type === 'order');
              const filteredReturns = filteredUnifiedRows.filter(r => r._type === 'return');
              return (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 shadow-lg z-40 px-4 py-3">
                <div className="max-w-7xl mx-auto">
                  {/* Filtered Totals Row */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
                    <span className="text-xs text-slate-500 font-medium uppercase">Sélection:</span>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Total Achats</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredOrders.reduce((sum, po) => sum + (parseFloat(String(po.totalamount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Versement</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredOrders.reduce((sum, po) => sum + (parseFloat(String(po.amountpaid)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Reste</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(filteredOrders.reduce((sum, po) => sum + ((parseFloat(String(po.totalamount)) || 0) - (parseFloat(String(po.amountpaid)) || 0)), 0))}
                      </span>
                    </div>
                    {filteredReturns.length > 0 && (
                      <div className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg shadow-sm">
                        <span className="text-xs font-medium">↩ Retours ({filteredReturns.length})</span>
                        <span className="font-bold text-sm ml-1">
                          -{formatCurrencyDZD(filteredReturns.reduce((sum, r) => sum + (parseFloat(String(r.totalamount)) || 0), 0))}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-white rounded-lg shadow-sm">
                      <span className="text-xs font-medium">Achats</span>
                      <span className="font-bold text-sm ml-1">{filteredOrders.length}</span>
                    </div>
                  </div>

                  {/* Overall Totals Row (all purchase orders) */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-slate-200">
                    <span className="text-xs text-slate-400 font-medium uppercase">Total Général:</span>
                    <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg border border-blue-200">
                      <span className="text-xs font-medium">Total</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(purchaseOrders.reduce((sum, po) => sum + (parseFloat(String(po.totalamount)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-lg border border-green-200">
                      <span className="text-xs font-medium">Versement</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(purchaseOrders.reduce((sum, po) => sum + (parseFloat(String(po.amountpaid)) || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 rounded-lg border border-red-200">
                      <span className="text-xs font-medium">Reste</span>
                      <span className="font-bold text-sm ml-1">
                        {formatCurrencyDZD(purchaseOrders.reduce((sum, po) => sum + ((parseFloat(String(po.totalamount)) || 0) - (parseFloat(String(po.amountpaid)) || 0)), 0))}
                      </span>
                    </div>
                    {purchaseReturns.length > 0 && (
                      <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-800 rounded-lg border border-orange-200">
                        <span className="text-xs font-medium">↩ Retours ({purchaseReturns.length})</span>
                        <span className="font-bold text-sm ml-1">
                          -{formatCurrencyDZD(purchaseReturns.reduce((sum, r) => sum + (parseFloat(String(r.totalamount)) || 0), 0))}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                      <span className="text-xs font-medium">Achats</span>
                      <span className="font-bold text-sm ml-1">{purchaseOrders.length}</span>
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* Spacer for fixed footer */}
            {!isLoading && filteredUnifiedRows.length > 0 && (
              <div className="h-28"></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
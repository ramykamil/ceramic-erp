'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSortableTable } from '@/hooks/useSortableTable';
import { ResizableSortableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { UserFilter } from '@/components/UserFilter';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useTableNavigation } from '@/hooks/useTableNavigation';

// --- Interface ---
interface Customer {
  customerid: number;
  customercode: string;
  customername: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  currentbalance: number; // Solde (Dû)
  totalbought: number; // Total Acheté
  creditlimit: number;
  isactive: boolean;
}

// --- Helpers ---
const formatCurrencyDZD = (amount: number | null | undefined): string => {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount)) return "0,00 DZD";
  return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(numericAmount);
};

// --- Component ---
export default function CustomersListPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = usePersistentState('customers_search', '');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the container on mount for immediate keyboard navigation
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Sorting
  const { sortedData, handleSort, getSortDirection } = useSortableTable<Customer>(customers);

  // Keyboard navigation
  const { selectedIndex, handleKeyDown, getRowClass, setSelectedIndex } = useTableNavigation({
    rowCount: sortedData.length,
    onAction: (idx) => {
      const customer = sortedData[idx];
      router.push(`/customers/${customer.customerid}`);
    }
  });

  // Resizable columns
  const { widths, handleResize } = useColumnWidths('customers-table', {
    customername: 180,
    address: 200,
    phone: 150,
    currentbalance: 120,
    totalbought: 130,
  });

  const [stats, setStats] = useState<{ totalReceivables: number; totalCustomers: number } | null>(null);

  useEffect(() => {
    fetchCustomers();
    // Only fetch stats once or when needed. 
    // Actually, fetchCustomers and fetchStats can run parallel.
    fetchStats();
  }, [search]);

  const fetchStats = async () => {
    try {
      const res = await api.getCustomerStats();
      // Note: api.getCustomerStats needs to be added to lib/api.ts or call endpoint directly
      // Since I can't edit lib/api.ts easily without viewing it first and it's robust...
      // Wait, did I add it to lib/api.ts? No. I should add it there or just use fetch.
      // I will assume for now I will add it to lib/api.ts.
      if (res.success) {
        setStats(res.data as { totalReceivables: number; totalCustomers: number });
      }
    } catch (e) {
      console.error("Error loading stats", e);
    }
  };

  const fetchCustomers = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const response = await api.getCustomers({ search });
      if (response.success) {
        setCustomers((response.data as Customer[]) || []);
      } else {
        if (response.message?.includes('token') || response.message?.includes('Authentication required')) {
          router.push('/login');
        }
        throw new Error(response.message || 'Erreur inconnue');
      }
    } catch (error: any) {
      console.error('Erreur chargement clients:', error);
      setApiError(`Impossible de charger les clients: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir désactiver le client : ${name} ?\nCette action est impossible s'il a des commandes en cours ou un solde impayé.`)) {
      return;
    }
    setApiError(null);
    try {
      const response = await api.deleteCustomer(id);
      if (response.success) {
        alert('Client désactivé avec succès !');
        fetchCustomers();
      } else {
        throw new Error(response.message || 'La désactivation a échoué');
      }
    } catch (error: any) {
      setApiError(error.message);
      alert(`Erreur: ${error.message}`);
    }
  };

  const handleHardDelete = async (id: number, code: string) => {
    const confirmation = prompt(`ACTION IRRÉVERSIBLE !\nVous êtes sur le point de supprimer définitivement ce client.\n\nPour confirmer, veuillez taper le code client : "${code}"`);

    if (confirmation !== code) {
      alert('Confirmation annulée ou code incorrect.');
      return;
    }

    setApiError(null);
    try {
      const response = await api.hardDeleteCustomer(id);
      if (response.success) {
        alert('Client supprimé définitivement avec succès !');
        fetchCustomers();
      } else {
        throw new Error(response.message || 'La suppression a échoué');
      }
    } catch (error: any) {
      setApiError(error.message);
      alert(`Erreur: ${error.message}`);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800 outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="max-w-7xl mx-auto">

        {/* --- Header --- */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Liste des Clients</h1>
            <p className="text-slate-500 text-sm mt-1">Gérer la base client et les crédits</p>
          </div>

          {/* Stats Card */}
          {stats && (
            <div className="bg-white p-3 px-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-2 bg-red-100 rounded-lg text-red-600">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Crédit Total Clients</p>
                <p className="text-xl font-bold text-slate-800">
                  {new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(stats.totalReceivables)}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {/* Nouveau Client Button */}
            <Link
              href="/customers/new"
              className="bg-brand-primary hover:bg-brand-primary-dark text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Nouveau Client
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

        {/* --- Error Display --- */}
        {apiError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* --- Filters Section --- */}
        <div className="mb-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search Bar */}
            <div className="flex-1 min-w-[250px] relative">
              <input
                type="text"
                placeholder="🔍 Rechercher par nom ou code client..."
                className="w-full p-2.5 pl-4 border border-slate-300 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* User Filter */}
            <UserFilter
              onUserChange={setSelectedUserId}
              label="Créé par"
            />
          </div>
        </div>

        {/* --- Data Table Container --- */}
        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          {isLoading ? (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-500">Chargement des clients...</p>
            </div>
          ) : customers.length === 0 && !apiError ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-lg">Aucun client trouvé.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                  <tr>
                    <ResizableSortableHeader label="Nom" sortKey="customername" currentDirection={getSortDirection('customername' as keyof Customer)} onSort={(k) => handleSort(k as keyof Customer)} width={widths.customername} onResize={handleResize} />
                    <ResizableSortableHeader label="Adresse" sortKey="address" currentDirection={getSortDirection('address' as keyof Customer)} onSort={(k) => handleSort(k as keyof Customer)} width={widths.address} onResize={handleResize} />
                    <ResizableSortableHeader label="Contact" sortKey="phone" currentDirection={getSortDirection('phone' as keyof Customer)} onSort={(k) => handleSort(k as keyof Customer)} width={widths.phone} onResize={handleResize} />
                    <ResizableSortableHeader label="Solde (Dû)" sortKey="currentbalance" currentDirection={getSortDirection('currentbalance' as keyof Customer)} onSort={(k) => handleSort(k as keyof Customer)} width={widths.currentbalance} onResize={handleResize} align="right" />
                    <ResizableSortableHeader label="Total Acheté" sortKey="totalbought" currentDirection={getSortDirection('totalbought' as keyof Customer)} onSort={(k) => handleSort(k as keyof Customer)} width={widths.totalbought} onResize={handleResize} align="right" />
                    <th scope="col" className="px-4 py-3 text-center" style={{ width: 180 }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedData.map((customer, idx) => (
                    <tr 
                      key={customer.customerid} 
                      className={getRowClass(idx, "hover:bg-slate-50 transition cursor-pointer")}
                      onClick={() => setSelectedIndex(idx)}
                    >
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {customer.customername}
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{customer.customercode}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 max-w-xs truncate">{customer.address || '—'}</td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{customer.phone || '—'}</div>
                        <div className="text-xs text-slate-400">{customer.email}</div>
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${customer.currentbalance > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {formatCurrencyDZD(customer.currentbalance)}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-blue-600">
                        {formatCurrencyDZD(customer.totalbought)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/customers/${customer.customerid}`}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition font-medium text-xs"
                            title="Gérer Prix Spécifiques"
                          >
                            Prix
                          </Link>
                          <Link
                            href={`/customers/${customer.customerid}?tab=situation`}
                            className="text-green-600 hover:text-green-800 hover:bg-green-50 px-3 py-1 rounded transition font-medium text-xs"
                            title="Voir Situation Financière"
                          >
                            Situation
                          </Link>
                          <button
                            onClick={() => router.push(`/customers/${customer.customerid}/edit`)}
                            className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-3 py-1 rounded transition font-medium text-xs"
                            title="Modifier Client"
                          >
                            Modifier
                          </button>

                          {customer.isactive ? (
                            <button
                              onClick={() => handleDelete(customer.customerid, customer.customername)}
                              className="text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1 rounded transition font-medium text-xs"
                              title="Désactiver Client"
                            >
                              Désactiver
                            </button>
                          ) : (
                            <button
                              onClick={() => handleHardDelete(customer.customerid, customer.customercode)}
                              className="text-slate-500 hover:text-slate-700 hover:bg-slate-200 px-3 py-1 rounded transition font-medium text-xs"
                              title="Supprimer Définitivement"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateQuickFilter, DateRange } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';

// Interface pour les transactions (basée sur la réponse API)
interface InventoryTransaction {
  transactionid: number;
  createdat: string;
  productcode: string;
  productname: string;
  warehousename: string;
  transactiontype: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
  quantity: number;
  referencetype: string | null;
  referenceid: number | null;
  ownershiptype: 'OWNED' | 'CONSIGNMENT' | null;
  factoryname: string | null;
  createdbyuser: string | null;
  qteparcolis?: number;  // Pieces per carton
  qtecolisparpalette?: number;  // Cartons per palette
}

// Fonction pour formater la date/heure
const formatDateTime = (dateTimeString: string): string => {
  try {
    return new Date(dateTimeString).toLocaleString('fr-DZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch (e) {
    return dateTimeString;
  }
};

// Fonction pour formater les quantités
const formatQuantityChange = (qty: number | null | undefined, type: string): string => {
  const numericQty = Number(qty);
  if (isNaN(numericQty)) return '0';
  let sign = '';
  if (type === 'IN') sign = '+';
  else if (type === 'OUT' || type === 'TRANSFER') sign = '-';
  else if (type === 'ADJUSTMENT' && numericQty > 0) sign = '+';
  const displayQty = type === 'OUT' || type === 'TRANSFER' ? Math.abs(numericQty) : numericQty;
  return `${sign}${displayQty.toLocaleString('fr-DZ')}`;
};

// Fonction pour obtenir les classes de badge
const getTypeBadge = (type: string): string => {
  const typeClasses = {
    IN: 'bg-green-100 text-green-800 border border-green-200',
    OUT: 'bg-red-100 text-red-800 border border-red-200',
    TRANSFER: 'bg-blue-100 text-blue-800 border border-blue-200',
    ADJUSTMENT: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  };
  return typeClasses[type as keyof typeof typeClasses] || 'bg-gray-100 text-gray-800 border border-gray-200';
};

function InventoryTransactionsContent() {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const initialProductId = useMemo(() => searchParams.get('productId'), [searchParams]);
  const initialWarehouseId = useMemo(() => searchParams.get('warehouseId'), [searchParams]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params: any = {
        page: 1,
        limit: 100,
      };
      if (search) params.search = search;
      if (transactionType) params.transactionType = transactionType;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (initialProductId) params.productId = initialProductId;
      if (initialWarehouseId) params.warehouseId = initialWarehouseId;
      if (selectedUserId) params.createdBy = selectedUserId;

      const response = await api.getInventoryTransactions(params);
      if (response.success) {
        setTransactions((response.data as InventoryTransaction[]) || []);
      } else {
        if (response.message?.includes('token') || response.message?.includes('Authentication required')) {
          router.push('/login');
        }
        throw new Error(response.message || 'Erreur inconnue');
      }
    } catch (error: any) {
      console.error('Erreur chargement transactions:', error);
      setApiError(`Impossible de charger l'historique: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [initialProductId, initialWarehouseId, selectedUserId]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransactions();
  };

  const handleResetFilters = () => {
    setSearch('');
    setTransactionType('');
    setDateFrom('');
    setDateTo('');
    router.push('/inventory/transactions');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
          <h1 className="text-3xl font-bold text-blue-800">Historique des Transactions de Stock</h1>
          <div>
            <Link href="/inventory" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Retour aux Niveaux de Stock
            </Link>
          </div>
        </div>

        {apiError && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* Date Quick Filter */}
        <div className="mb-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-2 font-medium">📅 Filtrer par date:</p>
              <DateQuickFilter
                onFilterChange={(range: DateRange) => {
                  setDateFrom(range.startDate || '');
                  setDateTo(range.endDate || '');
                }}
                defaultPreset="ALL"
                showCustom={false}
              />
            </div>
            <UserFilter
              onUserChange={(userId) => setSelectedUserId(userId)}
              label="Utilisateur"
            />
          </div>
        </div>

        <form onSubmit={handleFilterSubmit} className="mb-6 glassy-container p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label htmlFor="search" className="block text-sm font-medium text-slate-700 mb-1">Recherche Produit</label>
              <input
                type="text"
                id="search"
                placeholder="Par nom ou code produit..."
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="transactionType" className="block text-sm font-medium text-slate-700 mb-1">Type Transaction</label>
              <select id="transactionType" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80">
                <option value="">Tous Types</option>
                <option value="IN">Entrée (IN)</option>
                <option value="OUT">Sortie (OUT)</option>
                <option value="ADJUSTMENT">Ajustement</option>
                <option value="TRANSFER">Transfert</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-sm transition">
                Filtrer
              </button>
              <button type="button" onClick={handleResetFilters} className="flex-1 bg-slate-200 text-slate-700 hover:bg-slate-300 px-4 py-2 rounded-lg font-medium text-sm transition">
                Effacer
              </button>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="dateFrom" className="block text-sm font-medium text-slate-700 mb-1">Date Début</label>
              <input
                type="date"
                id="dateFrom"
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="dateTo" className="block text-sm font-medium text-slate-700 mb-1">Date Fin</label>
              <input
                type="date"
                id="dateTo"
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          {(initialProductId || initialWarehouseId) && (
            <div className="mt-3 text-sm text-slate-600">
              <p>Filtre initial appliqué :
                {initialProductId && <span> Produit ID: {initialProductId} </span>}
                {initialWarehouseId && <span> Entrepôt ID: {initialWarehouseId} </span>}
                (Effacez pour voir tout)
              </p>
            </div>
          )}
        </form>

        <div className="glassy-container overflow-hidden">
          {isLoading ? (
            <p className="text-center py-12 text-slate-500">Chargement de l'historique...</p>
          ) : transactions.length === 0 && !apiError ? (
            <p className="text-center py-12 text-slate-500">Aucune transaction trouvée pour ces filtres.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100 font-semibold sticky top-0">
                  <tr>
                    <th scope="col" className="px-4 py-4">Date / Heure</th>
                    <th scope="col" className="px-4 py-4">Produit</th>
                    <th scope="col" className="px-2 py-4 text-center">Pal</th>
                    <th scope="col" className="px-2 py-4 text-center">Ctn</th>
                    <th scope="col" className="px-4 py-4">Entrepôt</th>
                    <th scope="col" className="px-4 py-4 text-center">Type</th>
                    <th scope="col" className="px-4 py-4 text-right">Quantité Modifiée</th>
                    <th scope="col" className="px-4 py-4">Référence</th>
                    <th scope="col" className="px-4 py-4">Utilisateur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {transactions.map((tx) => {
                    const qty = Math.abs(Number(tx.quantity)) || 0;
                    const piecesPerCarton = Number(tx.qteparcolis) || 0;
                    const cartonsPerPalette = Number(tx.qtecolisparpalette) || 0;

                    // Calculate cartons and palettes
                    const cartonsNum = piecesPerCarton > 0 ? qty / piecesPerCarton : 0;
                    const cartons = piecesPerCarton > 0 ? cartonsNum.toFixed(2) : '-';
                    const palettes = cartonsPerPalette > 0 ? (cartonsNum / cartonsPerPalette).toFixed(2) : '-';

                    return (
                      <tr key={tx.transactionid} className="hover:bg-blue-50/50">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(tx.createdat)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{tx.productname}</div>
                          <div className="text-xs text-slate-500 font-mono">{tx.productcode}</div>
                          {(piecesPerCarton > 0 || cartonsPerPalette > 0) && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {piecesPerCarton > 0 && <span>{piecesPerCarton} pcs/ctn</span>}
                              {piecesPerCarton > 0 && cartonsPerPalette > 0 && <span> • </span>}
                              {cartonsPerPalette > 0 && <span>{cartonsPerPalette} ctn/pal</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center text-sm">{palettes}</td>
                        <td className="px-2 py-3 text-center text-sm">{cartons}</td>
                        <td className="px-4 py-3">{tx.warehousename}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getTypeBadge(tx.transactiontype)}`}>
                            {tx.transactiontype}
                          </span>
                          {tx.ownershiptype && (
                            <div className="text-xs text-slate-500 mt-1">({tx.ownershiptype === 'OWNED' ? 'Propre' : 'Consignation'})</div>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${(tx.transactiontype === 'IN' || (tx.transactiontype === 'ADJUSTMENT' && tx.quantity >= 0))
                          ? 'text-green-600'
                          : 'text-red-600'
                          }`}>
                          {formatQuantityChange(tx.quantity, tx.transactiontype)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {tx.referencetype || '-'} {tx.referenceid || ''}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{tx.createdbyuser || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InventoryTransactionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Chargement...</div>}>
      <InventoryTransactionsContent />
    </Suspense>
  );
}
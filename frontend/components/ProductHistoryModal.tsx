'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useSortableTable } from '@/hooks/useSortableTable';
import { StandardDateInput } from '@/components/DateQuickFilter';

// Import sub-tab components
import { ProductHistorySalesTab } from './ProductHistorySalesTab';
import { ProductHistoryPurchasesTab } from './ProductHistoryPurchasesTab';
import { ProductHistoryAdjustmentsTab } from './ProductHistoryAdjustmentsTab';
import { ProductHistoryReturnsTab } from './ProductHistoryReturnsTab';

interface ProductHistoryModalProps {
  isOpen: boolean;
  productId: number | null;
  onClose: () => void;
}

export default function ProductHistoryModal({ isOpen, productId, onClose }: ProductHistoryModalProps) {
  const [historyTab, setHistoryTab] = useState<'ventes' | 'achats' | 'ajustements' | 'retours'>('ventes');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Data States
  const [historyData, setHistoryData] = useState<{
    product: any;
    orders: any[];
    totals: any;
  } | null>(null);
  const [purchaseHistoryData, setPurchaseHistoryData] = useState<{
    product: any;
    orders: any[];
    totals: any;
  } | null>(null);
  const [adjustmentHistoryData, setAdjustmentHistoryData] = useState<{
    product: any;
    adjustments: any[];
    totals: any;
  } | null>(null);
  const [returnHistoryData, setReturnHistoryData] = useState<{
    product: any;
    purchaseReturns: any[];
    salesReturns: any[];
    totals: any;
  } | null>(null);

  // Loading States
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPurchaseHistory, setIsLoadingPurchaseHistory] = useState(false);
  const [isLoadingAdjustmentHistory, setIsLoadingAdjustmentHistory] = useState(false);
  const [isLoadingReturnHistory, setIsLoadingReturnHistory] = useState(false);

  // Sorting hooks
  const { sortedData: sortedVentes, handleSort: handleSortVentes, sortConfig: sortVentes } = useSortableTable(historyData?.orders || []);
  const { sortedData: sortedAchats, handleSort: handleSortAchats, sortConfig: sortAchats } = useSortableTable(purchaseHistoryData?.orders || []);
  const { sortedData: sortedAjustements, handleSort: handleSortAjustements, sortConfig: sortAjustements } = useSortableTable(adjustmentHistoryData?.adjustments || []);
  const { sortedData: sortedRetoursAchat, handleSort: handleSortRetoursAchat, sortConfig: sortRetoursAchat } = useSortableTable(returnHistoryData?.purchaseReturns || []);
  const { sortedData: sortedRetoursVente, handleSort: handleSortRetoursVente, sortConfig: sortRetoursVente } = useSortableTable(returnHistoryData?.salesReturns || []);

  const getModalSortIcon = (config: any, key: string) => {
    if (config.key !== key) return <span className="opacity-30 ml-1">↕</span>;
    return config.direction === 'asc' ? <span className="ml-1 text-sky-400">▲</span> : <span className="ml-1 text-sky-400">▼</span>;
  };

  const loadAllHistory = async (prodId: number, startDate?: string, endDate?: string) => {
    setIsLoadingHistory(true);
    setIsLoadingPurchaseHistory(true);
    setIsLoadingAdjustmentHistory(true);
    setIsLoadingReturnHistory(true);

    const dateParams: any = {};
    if (startDate) dateParams.startDate = startDate;
    if (endDate) dateParams.endDate = endDate;

    try {
      const [salesRes, purchaseRes, adjustmentRes, returnRes] = await Promise.all([
        api.getProductSalesHistory(prodId, Object.keys(dateParams).length > 0 ? dateParams : undefined),
        api.getProductPurchaseHistory(prodId, Object.keys(dateParams).length > 0 ? dateParams : undefined),
        api.getProductAdjustmentHistory(prodId, Object.keys(dateParams).length > 0 ? dateParams : undefined),
        api.getProductReturnHistory(prodId, Object.keys(dateParams).length > 0 ? dateParams : undefined)
      ]);

      if (salesRes.success && salesRes.data) {
        setHistoryData(salesRes.data as any);
      } else {
        setHistoryData(null);
      }
      if (purchaseRes.success && purchaseRes.data) {
        setPurchaseHistoryData(purchaseRes.data as any);
      } else {
        setPurchaseHistoryData(null);
      }
      if (adjustmentRes.success && adjustmentRes.data) {
        setAdjustmentHistoryData(adjustmentRes.data as any);
      } else {
        setAdjustmentHistoryData(null);
      }
      if (returnRes.success && returnRes.data) {
        setReturnHistoryData(returnRes.data as any);
      } else {
        setReturnHistoryData(null);
      }

      if (!salesRes.success && !purchaseRes.success && !adjustmentRes.success) {
        throw new Error('Échec du chargement de l\'historique');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
      onClose();
    } finally {
      setIsLoadingHistory(false);
      setIsLoadingPurchaseHistory(false);
      setIsLoadingAdjustmentHistory(false);
      setIsLoadingReturnHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && productId) {
      setHistoryTab('ventes');
      setHistoryStartDate('');
      setHistoryEndDate('');
      loadAllHistory(productId);
    } else {
      setHistoryData(null);
      setPurchaseHistoryData(null);
      setAdjustmentHistoryData(null);
      setReturnHistoryData(null);
    }
  }, [isOpen, productId]);

  if (!isOpen) return null;

  const productInfo = historyData?.product || purchaseHistoryData?.product;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl bg-slate-900/60 rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-100">📊 Historique Produit</h2>
            {productInfo && (
              <p className="text-sm text-slate-500 mt-1">
                {productInfo.productcode} - {productInfo.productname}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-400 text-2xl">&times;</button>
        </div>

        {/* Tabs + Date Filter */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 flex-wrap gap-2">
          <div className="flex">
            <button
              onClick={() => setHistoryTab('ventes')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${historyTab === 'ventes'
                ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-200 hover:border-white/[0.08]'
                }`}
            >
              📊 Historique des Ventes
            </button>
            <button
              onClick={() => setHistoryTab('achats')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${historyTab === 'achats'
                ? 'border-orange-500 text-orange-400 bg-orange-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-200 hover:border-white/[0.08]'
                }`}
            >
              🛒 Historique des Achats
            </button>
            <button
              onClick={() => setHistoryTab('ajustements')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${historyTab === 'ajustements'
                ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-200 hover:border-white/[0.08]'
                }`}
            >
              ⚡ Ajustements
            </button>
            <button
              onClick={() => setHistoryTab('retours')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${historyTab === 'retours'
                ? 'border-rose-500 text-rose-700 bg-rose-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-200 hover:border-white/[0.08]'
                }`}
            >
              ↩️ Retours
            </button>
          </div>
          <div className="flex items-center gap-2 py-2">
            <StandardDateInput
              value={historyStartDate}
              onChange={(val) => setHistoryStartDate(val)}
            />
            <span className="text-slate-400 text-xs">→</span>
            <StandardDateInput
              value={historyEndDate}
              onChange={(val) => setHistoryEndDate(val)}
            />
            <button onClick={() => { if (productId) loadAllHistory(productId, historyStartDate || undefined, historyEndDate || undefined); }} className="bg-sky-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-700">Filtrer</button>
            {(historyStartDate || historyEndDate) && (
              <button onClick={() => { setHistoryStartDate(''); setHistoryEndDate(''); if (productId) loadAllHistory(productId); }} className="text-slate-400 hover:text-sky-400 text-xs">✕</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* === VENTES TAB === */}
          {historyTab === 'ventes' && (
            <ProductHistorySalesTab
              isLoading={isLoadingHistory}
              historyData={historyData}
              sortedVentes={sortedVentes}
              handleSortVentes={handleSortVentes}
              sortVentes={sortVentes}
              getModalSortIcon={getModalSortIcon}
            />
          )}

          {/* === ACHATS TAB === */}
          {historyTab === 'achats' && (
            <ProductHistoryPurchasesTab
              isLoading={isLoadingPurchaseHistory}
              purchaseHistoryData={purchaseHistoryData}
              sortedAchats={sortedAchats}
              handleSortAchats={handleSortAchats}
              sortAchats={sortAchats}
              getModalSortIcon={getModalSortIcon}
            />
          )}

          {/* === AJUSTEMENTS TAB === */}
          {historyTab === 'ajustements' && (
            <ProductHistoryAdjustmentsTab
              isLoading={isLoadingAdjustmentHistory}
              adjustmentHistoryData={adjustmentHistoryData}
              sortedAjustements={sortedAjustements}
              handleSortAjustements={handleSortAjustements}
              sortAjustements={sortAjustements}
              getModalSortIcon={getModalSortIcon}
            />
          )}

          {/* === RETOURS TAB === */}
          {historyTab === 'retours' && (
            <ProductHistoryReturnsTab
              isLoading={isLoadingReturnHistory}
              returnHistoryData={returnHistoryData}
              sortedRetoursAchat={sortedRetoursAchat}
              sortedRetoursVente={sortedRetoursVente}
              handleSortRetoursAchat={handleSortRetoursAchat}
              handleSortRetoursVente={handleSortRetoursVente}
              sortRetoursAchat={sortRetoursAchat}
              sortRetoursVente={sortRetoursVente}
              getModalSortIcon={getModalSortIcon}
            />
          )}
        </div>
        <div className="p-4 bg-slate-900/40 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="bg-slate-900/60 border border-white/[0.08] text-slate-200 hover:bg-slate-900/40 px-4 py-2 rounded-lg font-medium text-sm">Fermer</button>
        </div>
      </div>
    </div>
  );
}

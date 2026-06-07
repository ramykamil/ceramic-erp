'use client';

import { useState, useEffect } from 'react';
import { formatDate, cn } from '@/lib/utils';
import api from '@/lib/api';
import Link from 'next/link';
import { TableVirtuoso } from 'react-virtuoso';
import { ResizableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { exportToExcel, formatCurrencyExport, formatQuantityExport } from '@/lib/exportToExcel';
import CatalogueSyncModal from '@/components/CatalogueSyncModal';
import ProductHistoryModal from '@/components/ProductHistoryModal';
import ProductEditModal from '@/components/ProductEditModal';
import ProductCreateModal from '@/components/ProductCreateModal';
import { useTableNavigation } from '@/hooks/useTableNavigation';
import { StandardDateInput } from '@/components/DateQuickFilter';

// Helper for formatting money
const formatMoney = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 }).format(amount || 0);
const formatQty = (amount: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, amount || 0));
const formatQCQty = (amount: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Math.max(0, amount || 0));

interface Product {
  productid: number;
  productcode: string;
  productname: string;
  famille: string;
  prixvente: number;
  prixachat: number;
  purchaseprice?: number; // Added fallback
  calibre: string;
  choix: string;
  qteparcolis: number;
  qtecolisparpalette: number;
  totalqty: number;
  nbpalette: number;
  nbcolis: number;
  size: string;
  derivedpiecespercolis: number;
  derivedcolisperpalette: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Server-Side State
  const [page, setPage] = useState(1);
  const [limit] = useState(50); // Set low limit for infinite scroll
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortBy, setSortBy] = useState<string>('ProductName');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  // Filter State
  const [search, setSearch] = useState('');
  const [familleFilter, setFamilleFilter] = useState('');
  const [choixFilter, setChoixFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  // Dropdown Options
  const [uniqueFamilles, setUniqueFamilles] = useState<string[]>([]);
  const [brands, setBrands] = useState<{ brandid: number; brandname: string }[]>([]); // NEW
  const [uniqueChoix, setUniqueChoix] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<{ warehouseid: number; warehousename: string }[]>([]); // Warehouses list
  const [units, setUnits] = useState<{ unitid: number; unitname: string; unitcode: string }[]>([]); // NEW


  // Global Stats & Filter Totals
  const [globalStats, setGlobalStats] = useState<{ totalqty: number; totalpallets: number; totalcolis: number; totalpurchasevalue: number; totalsalevalue: number; totalproducts: number } | null>(null);
  const [filterTotals, setFilterTotals] = useState<{ totalQty: number; totalColis: number; totalPalette: number; valeurAchat: number; valeurVente: number } | null>(null);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Catalogue Sync State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Delete Confirm State
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);

  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyProductId, setHistoryProductId] = useState<number | null>(null);

  // Resizable columns
  const { widths, handleResize } = useColumnWidths('products-table', {
    famille: 100,
    productcode: 100,
    productname: 200,
    nbpalette: 80,
    nbcolis: 70,
    totalqty: 80,
    prixachat: 90,
    prixvente: 90,
    calibre: 70,
    choix: 60,
    qteparcolis: 70,
    qtecolisparpalette: 70,
    valeur: 100,
  });

  // Table Navigation
  const { selectedIndex, handleKeyDown, getRowClass, getRowProps, setSelectedIndex } = useTableNavigation({
    rowCount: products.length,
    onAction: (idx) => {
      const product = products[idx];
      if (product) openEditModal(product);
    }
  });

  // Initial load - fetch filters only
  useEffect(() => {
    loadFilters();
  }, []);

  // Filter & Data reload
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      loadProducts(false);
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [search, familleFilter, choixFilter, stockFilter, sortBy, sortOrder]);

  const loadFilters = async () => {
    const res = await api.getProductFilters();
    if (res.success && res.data) {
      setUniqueFamilles(res.data.familles || []);
      setBrands(res.data.brands || []); // Store full brands
      setUniqueChoix(res.data.choix || []);
    }
    // Load stats
    const statsRes = await api.getProductStats();
    if (statsRes.success && statsRes.data) {
      setGlobalStats(statsRes.data);
    }
    // Load warehouses for product creation
    const whRes = await api.getWarehouses();
    if (whRes.success && whRes.data) {
      setWarehouses(whRes.data as { warehouseid: number; warehousename: string }[]);
    }
    // Load units
    const unitsRes = await api.getUnits();
    if (unitsRes.success && unitsRes.data) {
      setUnits(unitsRes.data as { unitid: number; unitname: string; unitcode: string }[]);
    }
  };

  const loadProducts = async (isLoadMore = false) => {
    if (!isLoadMore) setLoading(true);

    const nextPage = isLoadMore ? page + 1 : 1;
    const params: any = {
      search,
      limit,
      page: nextPage,
      sortBy,
      sortOrder
    };
    if (familleFilter) params.famille = familleFilter;
    if (choixFilter) params.choix = choixFilter;
    if (stockFilter) params.stockFilter = stockFilter;

    try {
      const res = await api.getProducts(params);
      let data = (res.data as Product[]) || [];

      if (res.success) {
        if (isLoadMore) {
          setProducts(prev => [...prev, ...data]);
          setPage(nextPage);
        } else {
          setProducts(data);
          setPage(1);
        }

        if ((res as any).pagination) {
          setTotalItems((res as any).pagination.totalItems);
          setTotalPages((res as any).pagination.totalPages);
        }

        if ((res as any).filterTotals) {
          setFilterTotals((res as any).filterTotals);
        }
      }
    } catch (error) {
      console.error("Failed to load products", error);
    } finally {
      if (!isLoadMore) setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('ASC');
    }
    setPage(1); // Reset to first page
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return '⇅';
    return sortOrder === 'ASC' ? '▲' : '▼';
  };



  // Delete Product
  const handleDelete = async (productId: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;

    setDeletingProductId(productId);
    try {
      const res = await api.deleteProduct(productId);
      if (res.success) {
        setProducts(products.filter(p => p.productid !== productId));
        alert('✅ Produit supprimé avec succès');
      } else {
        throw new Error(res.message || 'Échec de suppression');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setDeletingProductId(null);
    }
  };

  // Open Edit Modal
  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setIsEditModalOpen(true);
  };

  // Load Sales, Purchase, Adjustment & Return History for a product
  const loadSalesHistory = (productId: number) => {
    setHistoryProductId(productId);
    setIsHistoryModalOpen(true);
  };

  // No longer calculating totals on ALL products (too heavy). 
  // We can show totals of current page OR fetch grand totals from backend (Requires report API)
  // For now, let's just sum the Visible Page. Or better, just remove "Total" from footer or use "Total Page".
  // The client requested "Speed", so precise total calculation of 5000 items is a trade-off.
  const totalQtyPage = products.reduce((sum, p) => sum + Number(p.totalqty || 0), 0);
  const totalValuePage = products.reduce((sum, p) => sum + (Number(p.totalqty || 0) * Number(p.prixachat || 0)), 0);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Fetch products in batches to avoid Next.js proxy Content-Length errors on large responses
      const batchSize = 500;
      let allProducts: Product[] = [];
      let currentPage = 1;
      let hasMore = true;

      while (hasMore) {
        const params: any = {
          search,
          limit: batchSize,
          page: currentPage,
          sortBy,
          sortOrder
        };
        if (familleFilter) params.famille = familleFilter;
        if (choixFilter) params.choix = choixFilter;
        if (stockFilter) params.stockFilter = stockFilter;

        const res = await api.getProducts(params);
        const batch = (res.data as Product[]) || [];
        allProducts = [...allProducts, ...batch];

        // Stop if we got fewer items than requested (last page)
        if (batch.length < batchSize) {
          hasMore = false;
        } else {
          currentPage++;
        }
      }

      const dataToExport = allProducts;

      exportToExcel(
        dataToExport,
        [
          { key: 'productcode', label: 'Référence' },
          { key: 'productname', label: 'Libellé' },
          { key: 'famille', label: 'Famille' },
          { key: 'nbpalette', label: 'Palettes', format: formatQuantityExport },
          { key: 'nbcolis', label: 'Colis', format: formatQuantityExport },
          { key: 'totalqty', label: 'Qté', format: formatQuantityExport },
          { key: 'prixachat', label: 'Prix Achat', format: (val, row: any) => formatCurrencyExport(Number(val) || Number(row.purchaseprice) || 0) },
          { key: 'prixvente', label: 'Prix Vente', format: formatCurrencyExport },
          { key: 'calibre', label: 'Calibre' },
          { key: 'choix', label: 'Choix' },
        ],
        'catalogue_produits',
        'Produits'
      );
    } catch (error) {
      console.error("Failed to export products", error);
      alert("Erreur lors de l'exportation.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900/40 text-slate-100 overflow-hidden">
      <div className="flex flex-col h-full max-w-[1920px] mx-auto w-full p-4">

        {/* Header & Global Stats */}
        <div className="mb-2">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
                Catalogue Produits
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-3 py-1.5 rounded text-xs font-medium shadow-sm shadow-black/10 flex items-center gap-2 transition"
              >
                📥 Sync Excel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-medium shadow-sm shadow-black/10 flex items-center gap-2 disabled:opacity-50"
              >
                {isExporting ? '⏳ Exportation...' : '📄 Excel'}
              </button>
              <Link href="/" className="bg-slate-900/60 border border-white/[0.08] hover:bg-slate-900/40 text-slate-200 px-3 py-1.5 rounded text-xs font-medium transition shadow-sm shadow-black/10 flex items-center gap-2">
                ← Retour
              </Link>
              <button
                onClick={() => {
                  setIsCreateModalOpen(true);
                }}
                className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded text-xs font-medium shadow-sm shadow-black/10 flex items-center gap-2"
              >
                <span className="text-lg leading-none">+</span> Nouveau
              </button>
            </div>
          </div>


        </div>

        {/* SEARCH & FILTERS - Compact */}
        <div className="bg-slate-900/60 rounded border border-white/[0.06] shadow-sm shadow-black/10 p-2 mb-2 flex-shrink-0">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="🔍 Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full p-1.5 border border-white/[0.08] rounded text-xs focus:ring-2 focus:ring-sky-500/30 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={familleFilter}
                onChange={e => setFamilleFilter(e.target.value)}
                className="p-1.5 border border-white/[0.08] rounded text-xs bg-slate-900/60 min-w-[100px]"
              >
                <option value="">Famille : Toutes</option>
                {uniqueFamilles.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select
                value={choixFilter}
                onChange={e => setChoixFilter(e.target.value)}
                className="p-1.5 border border-white/[0.08] rounded text-xs bg-slate-900/60 min-w-[100px]"
              >
                <option value="">Choix : Tous</option>
                {uniqueChoix.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="1er Choix">1er Choix</option>
                <option value="2ème Choix">2ème Choix</option>
                <option value="MS">MS</option>
              </select>
              <select
                value={stockFilter}
                onChange={e => setStockFilter(e.target.value)}
                className="p-1.5 border border-white/[0.08] rounded text-xs bg-slate-900/60 min-w-[100px]"
              >
                <option value="">Stock : Tous</option>
                <option value="instock">En stock</option>
                <option value="lowstock">Stock faible</option>
                <option value="outofstock">Rupture</option>
              </select>
              {(familleFilter || choixFilter || stockFilter) && (
                <button
                  onClick={() => { setFamilleFilter(''); setChoixFilter(''); setStockFilter(''); }}
                  className="text-sky-400 hover:text-sky-300 text-xs font-medium"
                >
                  ✕ Effacer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* DATA TABLE - Maximized Height */}
        <div className="bg-slate-900/60 rounded border border-white/[0.06] shadow-sm shadow-black/10 flex-1 min-h-0 flex flex-col" style={{ maxHeight: 'calc(100vh - 165px)' }}>
          <div className="flex-1 w-full h-full">
            {loading && page === 1 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-slate-500 text-lg">Chargement...</div>
              </div>
            ) : products.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-slate-500 text-lg">Aucun produit trouvé. Modifiez votre recherche ou ajoutez des produits.</div>
              </div>
            ) : (
              <TableVirtuoso
                data={products}
                style={{ height: '100%' }}
                endReached={() => {
                  if (products.length < totalItems && !loading) {
                    loadProducts(true);
                  }
                }}
                components={{
                  Table: (props) => <table {...props} className="w-full text-xs" style={{ tableLayout: 'fixed' }} />,
                  TableHead: (props) => <thead {...props} className="bg-slate-700 text-white text-[10px] uppercase sticky top-0 z-10" />,
                  TableRow: (props) => {
                    const index = (props as any)['data-index'];
                    return (
                      <tr
                        {...props}
                        {...getRowProps(index)}
                        className={getRowClass(index, "hover:bg-sky-500/10 transition-colors cursor-pointer")}
                        onClick={() => setSelectedIndex(index)}
                      />
                    );
                  },
                }}
                fixedHeaderContent={() => (
                  <tr>
                    <ResizableHeader columnKey="famille" width={widths.famille} onResize={handleResize} onClick={() => handleSort('famille')} className="p-1.5 text-left cursor-pointer hover:bg-slate-600">Famille {getSortIcon('famille')}</ResizableHeader>

                    <ResizableHeader columnKey="productname" width={widths.productname} onResize={handleResize} onClick={() => handleSort('productname')} className="p-1.5 text-left cursor-pointer hover:bg-slate-600">Libellé {getSortIcon('productname')}</ResizableHeader>
                    <ResizableHeader columnKey="nbpalette" width={widths.nbpalette} onResize={handleResize} onClick={() => handleSort('nbpalette')} className="p-1.5 text-right cursor-pointer hover:bg-indigo-700" style={{ backgroundColor: '#3730a3' }}>Pal. {getSortIcon('nbpalette')}</ResizableHeader>
                    <ResizableHeader columnKey="nbcolis" width={widths.nbcolis} onResize={handleResize} onClick={() => handleSort('nbcolis')} className="p-1.5 text-right cursor-pointer hover:bg-indigo-700" style={{ backgroundColor: '#3730a3' }}>Colis {getSortIcon('nbcolis')}</ResizableHeader>
                    <ResizableHeader columnKey="totalqty" width={widths.totalqty} onResize={handleResize} onClick={() => handleSort('totalqty')} className="p-1.5 text-right font-bold cursor-pointer hover:bg-sky-700" style={{ backgroundColor: '#1e40af' }}>Qté {getSortIcon('totalqty')}</ResizableHeader>
                    <ResizableHeader columnKey="prixachat" width={widths.prixachat} onResize={handleResize} onClick={() => handleSort('prixachat')} className="p-1.5 text-right cursor-pointer hover:bg-slate-600">P. Achat {getSortIcon('prixachat')}</ResizableHeader>
                    <ResizableHeader columnKey="prixvente" width={widths.prixvente} onResize={handleResize} onClick={() => handleSort('prixvente')} className="p-1.5 text-right cursor-pointer hover:bg-slate-600">P. Vente {getSortIcon('prixvente')}</ResizableHeader>

                    <ResizableHeader columnKey="qteparcolis" width={widths.qteparcolis} onResize={handleResize} className="p-1.5 text-right text-slate-300">Q/C</ResizableHeader>
                    <ResizableHeader columnKey="qtecolisparpalette" width={widths.qtecolisparpalette} onResize={handleResize} className="p-1.5 text-right text-slate-300">C/P</ResizableHeader>
                    <ResizableHeader columnKey="valeur" width={widths.valeur} onResize={handleResize} className="p-1.5 text-right font-bold text-green-300">Valeur</ResizableHeader>
                    <th className="p-1.5 text-center" style={{ width: 60 }}>Actions</th>
                  </tr>
                )}
                itemContent={(index, p) => {
                  const valeurAchat = Number(p.totalqty || 0) * (Number(p.prixachat) || Number(p.purchaseprice) || 0);
                  const isDeleting = deletingProductId === p.productid;

                  return (
                    <>
                      <td className="p-1 text-slate-400 truncate">{p.famille || '-'}</td>

                      <td className="p-1 font-medium truncate max-w-[200px]" title={p.productname}>{p.productname}</td>

                      {/* Stock Columns */}
                      <td className="p-1 text-right bg-indigo-500/100/10/50 font-mono">{formatQty(p.nbpalette)}</td>
                      <td className="p-1 text-right bg-indigo-500/100/10/50 font-mono">{formatQty(p.nbcolis)}</td>
                      <td className="p-1 text-right bg-sky-500/10/50 font-bold font-mono text-sky-300">{formatQty(p.totalqty)}</td>

                      {/* Prices */}
                      <td className="p-1 text-right font-mono">{formatMoney(Number(p.prixachat) || Number(p.purchaseprice) || 0)}</td>
                      <td className="p-1 text-right font-mono">{formatMoney(p.prixvente)}</td>

                      {/* Packaging Info */}
                      <td className="p-1 text-right text-sky-400 font-mono font-medium text-[10px]">
                        {formatQCQty(Number(p.derivedpiecespercolis || p.qteparcolis || 0))}
                      </td>
                      <td className="p-1 text-right text-sky-400 font-mono font-medium text-[10px]">
                        {Number(p.derivedcolisperpalette || p.qtecolisparpalette || 0)}
                      </td>

                      {/* Total Value */}
                      <td className="p-1 text-right font-bold text-emerald-400 font-mono">{formatMoney(Number(p.totalqty || 0) * (Number(p.prixachat) || Number(p.purchaseprice) || 0))}</td>

                      {/* Actions */}
                      <td className="p-1 text-center py-1.5">
                        <div className="flex justify-center gap-0.5">
                          <button
                            onClick={() => loadSalesHistory(p.productid)}
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 p-1 rounded transition"
                            title="Historique"
                          >
                            📊
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            className="text-sky-400 hover:text-blue-800 hover:bg-sky-500/10 p-1 rounded transition"
                            title="Modifier"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(p.productid)}
                            disabled={isDeleting}
                            className="text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 p-1 rounded transition disabled:opacity-50"
                            title="Supprimer"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </>
                  );
                }}
              />
            )}
          </div>
        </div>

        {/* FOOTER TOTALS & PAGINATION - Fixed */}
        <div className="bg-slate-900/60 rounded-xl border border-white/[0.06] shadow-sm shadow-black/10 p-3 mt-4 flex-shrink-0">
          <div className="flex flex-col gap-2">

            {/* Filtered Stats - Moved Here & Dynamic */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-b border-slate-100 pb-2 mb-1">
              {/* Stock Filtered */}
              <div className="bg-slate-900/40 rounded shadow-sm shadow-black/10 border border-white/[0.06] px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Stock (Filtre)</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-100">
                      {formatQty(filterTotals?.totalQty ?? 0)}
                    </span>
                    <span className="text-[9px] text-slate-400">m²</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-medium text-sky-400 bg-slate-900/60 px-1.5 py-0.5 rounded-full border border-blue-100">
                    {formatQty(filterTotals?.totalPalette ?? 0)} <span className="text-slate-400">pal.</span>
                  </div>
                </div>
              </div>

              {/* Articles Filtered */}
              <div className="bg-slate-900/40 rounded shadow-sm shadow-black/10 border border-white/[0.06] px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Articles (Filtre)</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-100">{totalItems}</span>
                    <span className="text-[9px] text-slate-400">réf.</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-medium text-violet-600 bg-slate-900/60 px-1.5 py-0.5 rounded-full border border-violet-100">
                    {formatQty(filterTotals?.totalColis ?? 0)} <span className="text-slate-400">col.</span>
                  </div>
                </div>
              </div>

              {/* Valeur Achat Filtered */}
              <div className="bg-slate-900/40 rounded shadow-sm shadow-black/10 border border-white/[0.06] px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Valeur (Achat)</div>
                  <div className="text-sm font-bold text-slate-100 truncate">
                    {formatMoney(filterTotals?.valeurAchat ?? 0)}
                  </div>
                </div>
              </div>

              {/* Valeur Vente Filtered */}
              <div className="bg-emerald-50/50 rounded shadow-sm shadow-black/10 border border-emerald-100 px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-emerald-600/80 tracking-wider">Valeur (Vente)</div>
                  <div className="text-sm font-bold text-emerald-700 truncate">
                    {formatMoney(filterTotals?.valeurVente ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination Controls Row */}
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-slate-400">
                  Affichage de <span className="font-bold text-white">{products.length}</span> sur <span className="font-bold text-white">{totalItems}</span> produits
                </span>
                {loading && page > 1 && <span className="text-sm text-sky-400 animate-pulse ml-4 font-medium">Chargement en cours...</span>}
              </div>

              {/* Keep existing page totals if user wants doubles, but user asked for these cards. 
                  I will hide the old simple totals to avoid redundancy or keep them small. 
                  User said "I WANT THE SAME INFO IN THIS CARDS BELLOW". 
                  The cards effectively replace it. I'll comment out the old simple totals. 
              */}
              {/* 
              <div className="flex gap-3">
                <div className="text-xs text-slate-400 text-right">Totaux (Page)</div>
                ...
              </div> 
              */}
            </div>
          </div>
        </div>

        {/* Product Edit Modal */}
        <ProductEditModal
          isOpen={isEditModalOpen}
          product={editingProduct}
          brands={brands}
          units={units}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            loadProducts();
          }}
        />

        {/* Product Create Modal */}
        <ProductCreateModal
          isOpen={isCreateModalOpen}
          brands={brands}
          units={units}
          warehouses={warehouses}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            loadProducts();
            loadFilters();
          }}
        />

        {/* Product History Modal */}
        <ProductHistoryModal
          isOpen={isHistoryModalOpen}
          productId={historyProductId}
          onClose={() => {
            setIsHistoryModalOpen(false);
            setHistoryProductId(null);
          }}
        />

        {/* Catalogue Sync Modal */}
        <CatalogueSyncModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          onComplete={() => {
            loadProducts();
            loadFilters();
          }}
        />

      </div>
    </div>
  );
}
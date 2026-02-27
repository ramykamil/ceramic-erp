'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useSortableTable, SortDirection } from '@/hooks/useSortableTable'; // Can remove if unused, but let's keep import for now or just remove it. Remove it.
import Link from 'next/link';
// import { useSortableTable, SortDirection } from '@/hooks/useSortableTable'; // Removed
import { TableVirtuoso } from 'react-virtuoso';
import { ResizableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { exportToExcel, formatCurrencyExport, formatQuantityExport } from '@/lib/exportToExcel';

// Helper for formatting money
const formatMoney = (amount: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 }).format(amount || 0);
const formatQty = (amount: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

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

  // Global Stats
  const [globalStats, setGlobalStats] = useState<{ totalqty: number; totalpallets: number; totalcolis: number; totalpurchasevalue: number; totalsalevalue: number; totalproducts: number } | null>(null);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState<any | null>(null); // Weak typing for now to allow brandid
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Manual Quantity Adjustment State
  const [newTotalQty, setNewTotalQty] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({
    productcode: '',
    productname: '',
    brandid: 0, // NEW
    prixvente: 0,
    prixachat: 0,
    calibre: '',
    choix: '',
    qteparcolis: 0,
    qtecolisparpalette: 0,
    warehouseid: 0, // NEW: warehouse for product creation
  });

  // Delete Confirm State
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);

  // Sales History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState<{
    product: any;
    customers: any[];
    totals: { totalQty: number; totalAmount: number; totalOrders: number; customerCount: number; totalPallets?: number; totalCartons?: number };
  } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

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
    // Determine initial packaging unit
    const qty = Number(product.qteparcolis || 0);
    const isInteger = Math.abs(qty - Math.round(qty)) < 0.01 && qty > 0;

    setEditingProduct({
      ...product,
      packagingUnit: isInteger ? 'pcs' : 'm²'
    });
    setNewTotalQty('');
    setIsEditModalOpen(true);
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingProduct) return;

    setIsSaving(true);
    try {
      const res = await api.updateProduct(editingProduct.productid, {
        productcode: editingProduct.productcode,
        productname: editingProduct.productname,
        brandid: editingProduct.brandid || null, // Updated
        baseprice: editingProduct.prixvente,
        purchaseprice: editingProduct.prixachat,
        calibre: editingProduct.calibre,
        choix: editingProduct.choix,
        qteparcolis: editingProduct.qteparcolis,
        qtecolisparpalette: editingProduct.qtecolisparpalette,
      });
      if (res.success) {
        await loadProducts(); // Refresh list
        setIsEditModalOpen(false);
        setEditingProduct(null);
        alert('✅ Produit mis à jour');
      } else {
        throw new Error(res.message || 'Échec de mise à jour');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Manual Quantity Adjustment
  const handleAdjustQuantity = async () => {
    if (!editingProduct) return;
    const currentQty = Number(editingProduct.totalqty || 0);
    const targetQty = parseFloat(newTotalQty);
    if (isNaN(targetQty) || targetQty < 0) {
      alert('❌ Veuillez entrer une quantité valide (≥ 0)');
      return;
    }
    const difference = targetQty - currentQty;
    if (Math.abs(difference) < 0.001) {
      alert('⚠️ La quantité est déjà identique. Aucun ajustement nécessaire.');
      return;
    }
    if (!confirm(`Ajuster la quantité de ${formatQty(currentQty)} → ${formatQty(targetQty)} (${difference > 0 ? '+' : ''}${formatQty(difference)}) ?`)) return;

    setIsAdjusting(true);
    try {
      const res = await api.adjustProductQuantity({
        productId: editingProduct.productid,
        newTotalQty: targetQty,
        qteparcolis: editingProduct.qteparcolis,
        qtecolisparpalette: editingProduct.qtecolisparpalette,
        notes: `Ajustement manuel via catalogue: ${formatQty(currentQty)} → ${formatQty(targetQty)}`,
      });
      if (res.success) {
        alert('✅ Quantité ajustée avec succès');
        // Refresh list and update the editing product's totalqty
        await loadProducts();
        setEditingProduct({ ...editingProduct, totalqty: targetQty });
        setNewTotalQty('');
      } else {
        throw new Error(res.message || 'Échec de l\'ajustement');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsAdjusting(false);
    }
  };

  // Create New Product
  const handleCreateProduct = async () => {
    if (!newProduct.productcode.trim() || !newProduct.productname.trim()) {
      alert('Le code et le nom du produit sont requis.');
      return;
    }
    if (!newProduct.warehouseid) {
      alert('Veuillez sélectionner un entrepôt.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.createProduct({
        productcode: newProduct.productcode,
        productname: newProduct.productname,
        brandid: newProduct.brandid || null, // Updated
        baseprice: newProduct.prixvente,
        purchaseprice: newProduct.prixachat,
        calibre: newProduct.calibre,
        choix: newProduct.choix,
        qteparcolis: newProduct.qteparcolis,
        qtecolisparpalette: newProduct.qtecolisparpalette,
        warehouseid: newProduct.warehouseid, // NEW: pass selected warehouse
      });
      if (res.success) {
        await loadProducts();
        // await loadAllProducts(); // Removed for performance
        setIsCreateModalOpen(false);
        setNewProduct({
          productcode: '',
          productname: '',
          brandid: 0,
          prixvente: 0,
          prixachat: 0,
          calibre: '',
          choix: '',
          qteparcolis: 0,
          qtecolisparpalette: 0,
          warehouseid: 0, // Reset warehouse
        });
        alert('✅ Produit créé avec succès');
      } else {
        throw new Error(res.message || 'Échec de création');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Load Sales History for a product
  const loadSalesHistory = async (productId: number) => {
    setIsLoadingHistory(true);
    setIsHistoryModalOpen(true);
    try {
      const res = await api.getProductSalesHistory(productId);
      if (res.success && res.data) {
        setHistoryData(res.data as any);
      } else {
        throw new Error((res as any).message || 'Échec du chargement');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
      setIsHistoryModalOpen(false);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // No longer calculating totals on ALL products (too heavy). 
  // We can show totals of current page OR fetch grand totals from backend (Requires report API)
  // For now, let's just sum the Visible Page. Or better, just remove "Total" from footer or use "Total Page".
  // The client requested "Speed", so precise total calculation of 5000 items is a trade-off.
  const totalQtyPage = products.reduce((sum, p) => sum + Number(p.totalqty || 0), 0);
  const totalValuePage = products.reduce((sum, p) => sum + (Number(p.totalqty || 0) * Number(p.prixachat || 0)), 0);

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden">
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
                onClick={() => {
                  exportToExcel(
                    products,
                    [
                      { key: 'productcode', label: 'Référence' },
                      { key: 'productname', label: 'Libellé' },
                      { key: 'famille', label: 'Famille' },
                      { key: 'nbpalette', label: 'Palettes', format: formatQuantityExport },
                      { key: 'nbcolis', label: 'Colis', format: formatQuantityExport },
                      { key: 'totalqty', label: 'Qté', format: formatQuantityExport },
                      { key: 'prixachat', label: 'Prix Achat', format: (val, row) => formatCurrencyExport(Number(val) || Number(row.purchaseprice) || 0) },
                      { key: 'prixvente', label: 'Prix Vente', format: formatCurrencyExport },
                      { key: 'calibre', label: 'Calibre' },
                      { key: 'choix', label: 'Choix' },
                    ],
                    'catalogue_produits',
                    'Produits'
                  );
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-medium shadow-sm flex items-center gap-2"
              >
                📄 Excel
              </button>
              <Link href="/" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded text-xs font-medium transition shadow-sm flex items-center gap-2">
                ← Retour
              </Link>
              <button
                onClick={() => {
                  setIsCreateModalOpen(true);
                  setNewProduct(prev => ({ ...prev, productcode: `PROD-${Date.now()}` }));
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium shadow-sm flex items-center gap-2"
              >
                <span className="text-lg leading-none">+</span> Nouveau
              </button>
            </div>
          </div>


        </div>

        {/* SEARCH & FILTERS - Compact */}
        <div className="bg-white rounded border border-slate-200 shadow-sm p-2 mb-2 flex-shrink-0">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="🔍 Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full p-1.5 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={familleFilter}
                onChange={e => setFamilleFilter(e.target.value)}
                className="p-1.5 border border-slate-300 rounded text-xs bg-white min-w-[100px]"
              >
                <option value="">Famille : Toutes</option>
                {uniqueFamilles.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select
                value={choixFilter}
                onChange={e => setChoixFilter(e.target.value)}
                className="p-1.5 border border-slate-300 rounded text-xs bg-white min-w-[100px]"
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
                className="p-1.5 border border-slate-300 rounded text-xs bg-white min-w-[100px]"
              >
                <option value="">Stock : Tous</option>
                <option value="instock">En stock</option>
                <option value="lowstock">Stock faible</option>
                <option value="outofstock">Rupture</option>
              </select>
              {(familleFilter || choixFilter || stockFilter) && (
                <button
                  onClick={() => { setFamilleFilter(''); setChoixFilter(''); setStockFilter(''); }}
                  className="text-red-600 hover:text-red-700 text-xs font-medium"
                >
                  ✕ Effacer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* DATA TABLE - Maximized Height */}
        <div className="bg-white rounded border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col" style={{ maxHeight: 'calc(100vh - 165px)' }}>
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
                  Table: (props) => <table {...props} className="w-full text-xs [&>tbody>tr:nth-child(even)]:bg-slate-50 [&>tbody>tr:nth-child(odd)]:bg-white" style={{ tableLayout: 'fixed' }} />,
                  TableHead: (props) => <thead {...props} className="bg-slate-700 text-white text-[10px] uppercase sticky top-0 z-10" />,
                  TableRow: (props) => <tr {...props} className="hover:bg-blue-50 transition" />,
                }}
                fixedHeaderContent={() => (
                  <tr>
                    <ResizableHeader columnKey="famille" width={widths.famille} onResize={handleResize} onClick={() => handleSort('famille')} className="p-1.5 text-left cursor-pointer hover:bg-slate-600">Famille {getSortIcon('famille')}</ResizableHeader>

                    <ResizableHeader columnKey="productname" width={widths.productname} onResize={handleResize} onClick={() => handleSort('productname')} className="p-1.5 text-left cursor-pointer hover:bg-slate-600">Libellé {getSortIcon('productname')}</ResizableHeader>
                    <ResizableHeader columnKey="nbpalette" width={widths.nbpalette} onResize={handleResize} onClick={() => handleSort('nbpalette')} className="p-1.5 text-right cursor-pointer hover:bg-indigo-700" style={{ backgroundColor: '#3730a3' }}>Pal. {getSortIcon('nbpalette')}</ResizableHeader>
                    <ResizableHeader columnKey="nbcolis" width={widths.nbcolis} onResize={handleResize} onClick={() => handleSort('nbcolis')} className="p-1.5 text-right cursor-pointer hover:bg-indigo-700" style={{ backgroundColor: '#3730a3' }}>Colis {getSortIcon('nbcolis')}</ResizableHeader>
                    <ResizableHeader columnKey="totalqty" width={widths.totalqty} onResize={handleResize} onClick={() => handleSort('totalqty')} className="p-1.5 text-right font-bold cursor-pointer hover:bg-blue-700" style={{ backgroundColor: '#1e40af' }}>Qté {getSortIcon('totalqty')}</ResizableHeader>
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
                      <td className="p-1 text-slate-600 truncate">{p.famille || '-'}</td>

                      <td className="p-1 font-medium truncate max-w-[200px]" title={p.productname}>{p.productname}</td>

                      {/* Stock Columns */}
                      <td className="p-1 text-right bg-indigo-50/50 font-mono">{formatQty(p.nbpalette)}</td>
                      <td className="p-1 text-right bg-indigo-50/50 font-mono">{formatQty(p.nbcolis)}</td>
                      <td className="p-1 text-right bg-blue-50/50 font-bold font-mono text-blue-700">{formatQty(p.totalqty)}</td>

                      {/* Prices */}
                      <td className="p-1 text-right font-mono">{formatMoney(Number(p.prixachat) || Number(p.purchaseprice) || 0)}</td>
                      <td className="p-1 text-right font-mono">{formatMoney(p.prixvente)}</td>

                      {/* Packaging Info */}
                      <td className="p-1 text-right text-blue-600 font-mono font-medium text-[10px]">
                        {formatQty(Number(p.derivedpiecespercolis || p.qteparcolis || 0))}
                      </td>
                      <td className="p-1 text-right text-blue-600 font-mono font-medium text-[10px]">
                        {Number(p.derivedcolisperpalette || p.qtecolisparpalette || 0)}
                      </td>

                      {/* Total Value */}
                      <td className="p-1 text-right font-bold text-green-700 font-mono">{formatMoney(Number(p.totalqty || 0) * (Number(p.prixachat) || Number(p.purchaseprice) || 0))}</td>

                      {/* Actions */}
                      <td className="p-1 text-center py-1.5">
                        <div className="flex justify-center gap-0.5">
                          <button
                            onClick={() => loadSalesHistory(p.productid)}
                            className="text-green-600 hover:text-green-800 hover:bg-green-100 p-1 rounded transition"
                            title="Historique"
                          >
                            📊
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-1 rounded transition"
                            title="Modifier"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(p.productid)}
                            disabled={isDeleting}
                            className="text-red-600 hover:text-red-800 hover:bg-red-100 p-1 rounded transition disabled:opacity-50"
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mt-4 flex-shrink-0">
          <div className="flex flex-col gap-2">

            {/* Filtered Stats - Moved Here & Dynamic */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-b border-slate-100 pb-2 mb-1">
              {/* Stock Filtered */}
              <div className="bg-slate-50 rounded shadow-sm border border-slate-200 px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Stock (Filtre)</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-800">
                      {formatQty(products.reduce((acc, p) => acc + Number(p.totalqty || 0), 0))}
                    </span>
                    <span className="text-[9px] text-slate-400">m²</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-medium text-blue-600 bg-white px-1.5 py-0.5 rounded-full border border-blue-100">
                    {formatQty(products.reduce((acc, p) => acc + Number(p.nbpalette || 0), 0))} <span className="text-slate-400">pal.</span>
                  </div>
                </div>
              </div>

              {/* Articles Filtered */}
              <div className="bg-slate-50 rounded shadow-sm border border-slate-200 px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Articles (Filtre)</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-800">{products.length}</span>
                    <span className="text-[9px] text-slate-400">réf.</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-medium text-violet-600 bg-white px-1.5 py-0.5 rounded-full border border-violet-100">
                    {formatQty(products.reduce((acc, p) => acc + Number(p.nbcolis || 0), 0))} <span className="text-slate-400">col.</span>
                  </div>
                </div>
              </div>

              {/* Valeur Achat Filtered */}
              <div className="bg-slate-50 rounded shadow-sm border border-slate-200 px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Valeur (Achat)</div>
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {formatMoney(products.reduce((acc, p) => acc + (Number(p.totalqty || 0) * (Number(p.prixachat) || Number(p.purchaseprice) || 0)), 0))}
                  </div>
                </div>
              </div>

              {/* Valeur Vente Filtered */}
              <div className="bg-emerald-50/50 rounded shadow-sm border border-emerald-100 px-2 py-1 flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-emerald-600/80 tracking-wider">Valeur (Vente)</div>
                  <div className="text-sm font-bold text-emerald-700 truncate">
                    {formatMoney(products.reduce((acc, p) => acc + (Number(p.totalqty || 0) * Number(p.prixvente || 0)), 0))}
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination Controls Row */}
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-slate-600">
                  Affichage de <span className="font-bold text-slate-900">{products.length}</span> sur <span className="font-bold text-slate-900">{totalItems}</span> produits
                </span>
                {loading && page > 1 && <span className="text-sm text-blue-500 animate-pulse ml-4 font-medium">Chargement en cours...</span>}
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

        {/* EDIT MODAL */}
        {isEditModalOpen && editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <h2 className="text-lg font-bold text-slate-800">Modifier Produit</h2>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                {/* Row 1: Code Produit & Marque */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Code Produit</label>
                    <input
                      type="text"
                      value={editingProduct.productcode}
                      onChange={e => setEditingProduct({ ...editingProduct, productcode: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Marque (Famille)</label>
                    <select
                      value={editingProduct.brandid !== undefined && editingProduct.brandid !== null ? String(editingProduct.brandid) : '0'}
                      onChange={e => setEditingProduct({ ...editingProduct, brandid: e.target.value === '0' ? null : Number(e.target.value) })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="0">-- Aucune --</option>
                      {brands.map(b => (
                        <option key={b.brandid} value={b.brandid}>{b.brandname}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: Nom du Produit (full width) */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Nom du Produit</label>
                  <input
                    type="text"
                    value={editingProduct.productname}
                    onChange={e => setEditingProduct({ ...editingProduct, productname: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                {/* Row 3: Prix Vente & Prix Achat */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Prix Vente (DZD)</label>
                    <input
                      type="number"
                      onWheel={(e) => e.currentTarget.blur()}
                      value={editingProduct.prixvente}
                      onChange={e => setEditingProduct({ ...editingProduct, prixvente: Number(e.target.value) })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Prix Achat (DZD)</label>
                    <input
                      type="number"
                      onWheel={(e) => e.currentTarget.blur()}
                      value={editingProduct.prixachat}
                      onChange={e => setEditingProduct({ ...editingProduct, prixachat: Number(e.target.value) })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                {/* Row 4: Calibre & Choix */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Calibre</label>
                    <input
                      type="text"
                      value={editingProduct.calibre || ''}
                      onChange={e => setEditingProduct({ ...editingProduct, calibre: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Choix</label>
                    <select
                      value={editingProduct.choix || ''}
                      onChange={e => setEditingProduct({ ...editingProduct, choix: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="">--</option>
                      <option value="1er Choix">1er Choix</option>
                      <option value="2ème Choix">2ème Choix</option>
                      <option value="MS">MS</option>
                    </select>
                  </div>
                </div>

                {/* Packaging Section */}
                <div className="border-t border-slate-200 pt-4 mt-2">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">📦 Emballage</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-medium text-slate-500 uppercase">
                          Qté par Colis {editingProduct.packagingUnit ? `(${editingProduct.packagingUnit})` : '(m²)'}
                        </label>
                        <select
                          value={editingProduct.packagingUnit || 'm²'}
                          onChange={e => setEditingProduct({ ...editingProduct, packagingUnit: e.target.value })}
                          className="text-xs p-0.5 border border-slate-300 rounded bg-slate-50 text-slate-700"
                        >
                          <option value="m²">m²</option>
                          <option value="pcs">pcs</option>
                        </select>
                      </div>
                      <input
                        type="number"
                        onWheel={(e) => e.currentTarget.blur()}
                        step="0.01"
                        value={editingProduct.qteparcolis ?? ''}
                        onChange={e => setEditingProduct({ ...editingProduct, qteparcolis: Number(e.target.value) })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        placeholder={editingProduct.packagingUnit === 'pcs' ? "Ex: 2" : "Ex: 1.44"}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Colis par Palette</label>
                      <input
                        type="number"
                        onWheel={(e) => e.currentTarget.blur()}
                        value={editingProduct.qtecolisparpalette ?? ''}
                        onChange={e => setEditingProduct({ ...editingProduct, qtecolisparpalette: Number(e.target.value) })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        placeholder="Ex: 48"
                      />
                    </div>
                  </div>
                </div>

                {/* Manual Quantity Adjustment Section */}
                <div className="border-t border-slate-200 pt-4 mt-2">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">📊 Ajustement Quantité</h3>
                  <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                    {/* Current Qty Display */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 uppercase">Quantité actuelle</span>
                      <span className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                        {formatQty(Number(editingProduct.totalqty || 0))}
                      </span>
                    </div>
                    {/* New Total Qty Input */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Nouvelle quantité totale</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          onWheel={(e) => e.currentTarget.blur()}
                          step="0.01"
                          min="0"
                          value={newTotalQty}
                          onChange={e => setNewTotalQty(e.target.value)}
                          placeholder={`Ex: ${formatQty(Number(editingProduct.totalqty || 0))}`}
                          className="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm"
                        />
                        <button
                          onClick={handleAdjustQuantity}
                          disabled={isAdjusting || !newTotalQty}
                          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50 whitespace-nowrap"
                        >
                          {isAdjusting ? '⏳...' : '⚡ Appliquer'}
                        </button>
                      </div>
                    </div>
                    {/* Difference Preview */}
                    {newTotalQty && !isNaN(parseFloat(newTotalQty)) && (() => {
                      const diff = parseFloat(newTotalQty) - Number(editingProduct.totalqty || 0);
                      if (Math.abs(diff) < 0.001) return (
                        <div className="text-xs text-slate-400 text-center">Aucun changement</div>
                      );
                      return (
                        <div className={`text-xs font-medium text-center py-1 px-2 rounded ${diff > 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
                          }`}>
                          {diff > 0 ? '↑' : '↓'} Différence: {diff > 0 ? '+' : ''}{formatQty(diff)}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSaving}
                  className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50"
                >
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CREATE MODAL */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white">
                <h2 className="text-lg font-bold text-slate-800">➕ Nouveau Produit</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Code Produit *</label>
                    <input
                      type="text"
                      value={newProduct.productcode}
                      onChange={e => setNewProduct({ ...newProduct, productcode: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                      placeholder="Ex: PRD-001"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Marque (Famille)</label>
                    <select
                      value={newProduct.brandid || ''}
                      onChange={e => setNewProduct({ ...newProduct, brandid: Number(e.target.value) })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="0">-- Aucune --</option>
                      {brands.map(b => (
                        <option key={b.brandid} value={b.brandid}>{b.brandname}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Nom du Produit *</label>
                  <input
                    type="text"
                    value={newProduct.productname}
                    onChange={e => setNewProduct({ ...newProduct, productname: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    placeholder="Ex: CARRELAGE GRIS 60x60"
                  />
                </div>

                {/* Added Choix here for new layout */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Choix</label>
                  <select
                    value={newProduct.choix}
                    onChange={e => setNewProduct({ ...newProduct, choix: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">--</option>
                    <option value="1er Choix">1er Choix</option>
                    <option value="2ème Choix">2ème Choix</option>
                    <option value="MS">MS</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Prix Vente (DZD)</label>
                    <input
                      type="number"
                      onWheel={(e) => e.currentTarget.blur()}
                      value={newProduct.prixvente || ''}
                      onChange={e => setNewProduct({ ...newProduct, prixvente: Number(e.target.value) })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Prix Achat (DZD)</label>
                    <input
                      type="number"
                      onWheel={(e) => e.currentTarget.blur()}
                      value={newProduct.prixachat || ''}
                      onChange={e => setNewProduct({ ...newProduct, prixachat: Number(e.target.value) })}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Calibre</label>
                  <input
                    type="text"
                    value={newProduct.calibre}
                    onChange={e => setNewProduct({ ...newProduct, calibre: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    placeholder="Ex: C1, 01"
                  />
                </div>

                {/* Packaging Section */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">📦 Emballage</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Qté par Colis (pcs ou m²)</label>
                      <input
                        type="number"
                        onWheel={(e) => e.currentTarget.blur()}
                        step="0.01"
                        value={newProduct.qteparcolis ?? ''}
                        onChange={e => setNewProduct({ ...newProduct, qteparcolis: Number(e.target.value) })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        placeholder="Ex: 1.44"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Colis par Palette</label>
                      <input
                        type="number"
                        onWheel={(e) => e.currentTarget.blur()}
                        value={newProduct.qtecolisparpalette ?? ''}
                        onChange={e => setNewProduct({ ...newProduct, qtecolisparpalette: Number(e.target.value) })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        placeholder="Ex: 48"
                      />
                    </div>
                  </div>
                </div>

                {/* Warehouse Selection */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">🏭 Entrepôt Initial *</h3>
                  <select
                    value={newProduct.warehouseid || ''}
                    onChange={e => setNewProduct({ ...newProduct, warehouseid: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    required
                  >
                    <option value="">-- Sélectionner l'entrepôt --</option>
                    {warehouses.map(wh => (
                      <option key={wh.warehouseid} value={wh.warehouseid}>{wh.warehousename}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Le produit sera créé uniquement dans cet entrepôt</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSaving}
                  className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateProduct}
                  disabled={isSaving}
                  className="bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50"
                >
                  {isSaving ? 'Création...' : 'Créer Produit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SALES HISTORY MODAL */}
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-6xl bg-white rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">📊 Historique des Ventes</h2>
                  {historyData?.product && (
                    <p className="text-sm text-slate-500 mt-1">
                      {historyData.product.productcode} - {historyData.product.productname}
                    </p>
                  )}
                </div>
                <button onClick={() => { setIsHistoryModalOpen(false); setHistoryData(null); }} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {isLoadingHistory ? (
                  <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-500">Chargement...</p>
                  </div>
                ) : historyData ? (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-600 font-medium uppercase">Clients</p>
                        <p className="text-2xl font-bold text-blue-700">{historyData.totals.customerCount}</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <p className="text-xs text-purple-600 font-medium uppercase">Commandes</p>
                        <p className="text-2xl font-bold text-purple-700">{historyData.totals.totalOrders}</p>
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                        <p className="text-xs text-indigo-600 font-medium uppercase">Palettes</p>
                        <p className="text-2xl font-bold text-indigo-700">{historyData.totals.totalPallets || 0}</p>
                      </div>
                      <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                        <p className="text-xs text-cyan-600 font-medium uppercase">Cartons</p>
                        <p className="text-2xl font-bold text-cyan-700">{historyData.totals.totalCartons || 0}</p>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                        <p className="text-xs text-emerald-600 font-medium uppercase">Qté (m²/pcs)</p>
                        <p className="text-2xl font-bold text-emerald-700">{formatQty(historyData.totals.totalQty)}</p>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                        <p className="text-xs text-amber-600 font-medium uppercase">Chiffre d'Affaires</p>
                        <p className="text-2xl font-bold text-amber-700">{formatMoney(historyData.totals.totalAmount)}</p>
                      </div>
                    </div>

                    {/* Customers Table */}
                    {historyData.customers.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <p className="text-lg">Aucune vente enregistrée pour ce produit</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100 text-xs text-slate-500 uppercase">
                            <tr>
                              <th className="p-3 text-left">Client</th>
                              <th className="p-3 text-center">Type</th>
                              <th className="p-3 text-center">Commandes</th>
                              <th className="p-3 text-right bg-indigo-100">Palettes</th>
                              <th className="p-3 text-right bg-cyan-100">Cartons</th>
                              <th className="p-3 text-right bg-emerald-100">Qté</th>
                              <th className="p-3 text-right">Montant</th>
                              <th className="p-3 text-right">Prix Moy.</th>
                              <th className="p-3 text-center">Dernière</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {historyData.customers.map((c: any) => (
                              <tr key={c.customerid} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-800">
                                  {c.customername}
                                  <span className="text-xs text-slate-400 ml-2">{c.customercode}</span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.customertype === 'WHOLESALE' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                                    }`}>
                                    {c.customertype === 'WHOLESALE' ? 'Gros' : 'Détail'}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-mono">{c.ordercount}</td>
                                <td className="p-3 text-right font-bold text-indigo-600 font-mono bg-indigo-50/50">{c.totalpallets || 0}</td>
                                <td className="p-3 text-right font-bold text-cyan-600 font-mono bg-cyan-50/50">{c.totalcartons || 0}</td>
                                <td className="p-3 text-right font-bold text-emerald-600 font-mono bg-emerald-50/50">{formatQty(c.totalqty)}</td>
                                <td className="p-3 text-right font-bold text-slate-800 font-mono">{formatMoney(c.totalamount)}</td>
                                <td className="p-3 text-right text-slate-600 font-mono">{formatMoney(c.avgprice)}</td>
                                <td className="p-3 text-center text-slate-500 text-xs">
                                  {c.lastorderdate ? new Date(c.lastorderdate).toLocaleDateString('fr-DZ') : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => { setIsHistoryModalOpen(false); setHistoryData(null); }}
                  className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div >
  );
}
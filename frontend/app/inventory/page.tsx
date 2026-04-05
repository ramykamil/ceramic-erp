'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResizableSortableHeader, useColumnWidths } from '@/components/ResizableSortableHeader';
import { exportToExcel, formatQuantityExport } from '@/lib/exportToExcel';

// --- Interfaces ---
interface InventoryLevel {
  inventoryid: number;
  productid: number;  // The actual ProductID for transactions
  quantity: number;
  ownershipType: 'OWNED' | 'CONSIGNMENT';
  factoryId?: number | null;
  notes?: string;
  quantityonhand?: number;
  productname?: string;
  productcode?: string;
  warehousename?: string;
  brandname?: string;
  palletcount?: number;
  coliscount?: number;
  quantityreserved?: number;
  quantityavailable?: number;
  reorderlevel?: number;
}

interface Product { productid: number; productcode: string; productname: string; }

interface StockAdjustmentData {
  productId: number;
  warehouseId: number;
  quantity: number;
  ownershipType: 'OWNED' | 'CONSIGNMENT';
  factoryId: number | null;
  notes: string;
}

// --- Helpers ---
const formatQuantity = (qty: number | null | undefined): string => {
  const numericQty = Number(qty);
  if (isNaN(numericQty)) return '0';
  return numericQty.toLocaleString('fr-DZ');
};

// --- Stock Adjustment Modal Component (Enhanced with Pal/Ctn/Qty) ---
interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: StockAdjustmentData) => Promise<void>;
  isSaving: boolean;
  error: string | null;
}

// Extended product interface for packaging data
interface ProductWithPackaging {
  productid: number;
  productcode: string;
  productname: string;
  piecespercarton?: number;
  sqmperpiece?: number;
  cartonsperpalette?: number;
}

// Default packaging values
const DEFAULT_SQM_PER_PIECE = 0.36; // 60x60 tile
const DEFAULT_PIECES_PER_CARTON = 4;
const DEFAULT_CTN_PER_PALETTE = 36;

function StockAdjustmentModal({ isOpen, onClose, onSave, isSaving, error }: StockAdjustmentModalProps) {
  const [productId, setProductId] = useState<number | ''>('');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [ownershipType, setOwnershipType] = useState<'OWNED' | 'CONSIGNMENT'>('OWNED');
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  // Packaging fields
  const [palettes, setPalettes] = useState(0);
  const [cartons, setCartons] = useState(0);
  const [pieces, setPieces] = useState(0);
  const [quantity, setQuantity] = useState(0); // SQM
  const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE'>('ADD');

  // Packaging ratios (from selected product or defaults)
  const [sqmPerPiece, setSqmPerPiece] = useState(DEFAULT_SQM_PER_PIECE);
  const [piecesPerCarton, setPiecesPerCarton] = useState(DEFAULT_PIECES_PER_CARTON);
  const [cartonsPerPalette, setCartonsPerPalette] = useState(DEFAULT_CTN_PER_PALETTE);

  const [products, setProducts] = useState<ProductWithPackaging[]>([]);
  const [warehouses, setWarehouses] = useState<{ warehouseid: number; warehousename: string }[]>([]);
  const [factories, setFactories] = useState<{ factoryid: number; factoryname: string }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithPackaging | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [currentInventory, setCurrentInventory] = useState<{ palettes: number; cartons: number; pieces: number; sqm: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProductId('');
      setWarehouseId('');
      setOwnershipType('OWNED');
      setFactoryId('');
      setNotes('');
      setPalettes(0);
      setCartons(0);
      setPieces(0);
      setQuantity(0);
      setAdjustmentType('ADD');
      setSelectedProduct(null);
      setProductSearch('');
      setShowProductDropdown(false);
      setCurrentInventory(null);

      setCurrentInventory(null);

      // Initial fetch handled by search effect
      // api.getProducts({ limit: 500 }).then(res => res.success && setProducts((res.data as ProductWithPackaging[]) || []));
      api.getWarehouses().then(res => res.success && setWarehouses((res.data as { warehouseid: number; warehousename: string }[]) || []));
      api.getFactories().then(res => res.success && setFactories((res.data as { factoryid: number; factoryname: string }[]) || []));
    }
  }, [isOpen]);

  // When product changes, update packaging ratios
  const handleProductChange = (pid: number | '') => {
    setProductId(pid);
    if (pid !== '') {
      const product = products.find(p => p.productid === pid);
      setSelectedProduct(product || null);
      if (product) {
        // Get packaging from product or use defaults
        setSqmPerPiece(product.sqmperpiece || DEFAULT_SQM_PER_PIECE);
        setPiecesPerCarton(product.piecespercarton || DEFAULT_PIECES_PER_CARTON);
        setCartonsPerPalette(product.cartonsperpalette || DEFAULT_CTN_PER_PALETTE);

        // Fetch current inventory for this product
        api.getInventoryLevels({ productId: product.productid }).then(res => {
          if (res.success && (res.data as any[])?.length > 0) {
            const inv = (res.data as any[])[0];
            const sqm = Number(inv.quantityonhand) || 0;
            const sqmPerPc = product.sqmperpiece || DEFAULT_SQM_PER_PIECE;
            const pcsPerCtn = product.piecespercarton || DEFAULT_PIECES_PER_CARTON;
            const ctnPerPal = product.cartonsperpalette || DEFAULT_CTN_PER_PALETTE;

            const pcs = sqmPerPc > 0 ? Math.round(sqm / sqmPerPc) : 0;
            const ctns = pcsPerCtn > 0 ? parseFloat((pcs / pcsPerCtn).toFixed(2)) : 0;
            const pals = ctnPerPal > 0 ? parseFloat((ctns / ctnPerPal).toFixed(2)) : 0;

            setCurrentInventory({ palettes: pals, cartons: ctns, pieces: pcs, sqm });
          } else {
            setCurrentInventory({ palettes: 0, cartons: 0, pieces: 0, sqm: 0 });
          }
        });
      }
    } else {
      setSelectedProduct(null);
      setCurrentInventory(null);
    }
    // Reset quantities
    setPalettes(0);
    setCartons(0);
    setPieces(0);
    setQuantity(0);
  };

  // Debounced Server-Side Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      // If search is empty, maybe don't fetch or fetch defaults? 
      // Fetching defaults is useful for initial list.
      // But we should prioritize search terms.

      const res = await api.getProducts({
        search: productSearch,
        limit: 20 // Limit results for dropdown 
      });

      if (res.success) {
        setProducts((res.data as ProductWithPackaging[]) || []);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [productSearch]);

  const selectProduct = (product: ProductWithPackaging) => {
    handleProductChange(product.productid);
    setProductSearch(product.productname);
    setShowProductDropdown(false);
  };

  const clearProduct = () => {
    setProductId('');
    setSelectedProduct(null);
    setProductSearch('');
    setPalettes(0);
    setCartons(0);
    setPieces(0);
    setQuantity(0);
  };

  // Auto-calculation functions
  const handlePalettesChange = (val: number) => {
    setPalettes(val);
    const newCartons = parseFloat((val * cartonsPerPalette).toFixed(2));
    setCartons(newCartons);
    const newPieces = Math.round(newCartons * piecesPerCarton);
    setPieces(newPieces);
    setQuantity(Number((newPieces * sqmPerPiece).toFixed(4)));
  };

  const handleCartonsChange = (val: number) => {
    setCartons(val);
    setPalettes(cartonsPerPalette > 0 ? parseFloat((val / cartonsPerPalette).toFixed(2)) : 0);
    const newPieces = Math.round(val * piecesPerCarton);
    setPieces(newPieces);
    setQuantity(Number((newPieces * sqmPerPiece).toFixed(4)));
  };

  const handlePiecesChange = (val: number) => {
    setPieces(val);
    const newCartons = piecesPerCarton > 0 ? parseFloat((val / piecesPerCarton).toFixed(2)) : 0;
    setCartons(newCartons);
    setPalettes(cartonsPerPalette > 0 ? parseFloat((newCartons / cartonsPerPalette).toFixed(2)) : 0);
    setQuantity(Number((val * sqmPerPiece).toFixed(4)));
  };

  const handleQuantityChange = (val: number) => {
    setQuantity(val);
    if (sqmPerPiece > 0) {
      const newPieces = Math.round(val / sqmPerPiece);
      setPieces(newPieces);
      const newCartons = piecesPerCarton > 0 ? parseFloat((newPieces / piecesPerCarton).toFixed(2)) : 0;
      setCartons(newCartons);
      setPalettes(cartonsPerPalette > 0 ? parseFloat((newCartons / cartonsPerPalette).toFixed(2)) : 0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (productId === '' || warehouseId === '' || quantity <= 0) {
      alert("Produit, Entrepôt et Quantité sont requis.");
      return;
    }

    // Apply adjustment type (positive for ADD, negative for REMOVE)
    const finalQuantity = adjustmentType === 'ADD' ? quantity : -quantity;

    const adjustmentData: StockAdjustmentData = {
      productId: Number(productId),
      warehouseId: Number(warehouseId),
      quantity: finalQuantity,
      ownershipType: ownershipType,
      factoryId: ownershipType === 'CONSIGNMENT' ? Number(factoryId) || null : null,
      notes: notes || `Ajustement: ${adjustmentType === 'ADD' ? '+' : '-'}${quantity} m² (${palettes} pal, ${cartons} ctn, ${pieces} pcs)`,
    };
    if (adjustmentData.ownershipType === 'CONSIGNMENT' && !adjustmentData.factoryId) {
      alert("L'usine (Factory) est requise pour le stock en consignation.");
      return;
    }
    onSave(adjustmentData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">📦 Ajustement Manuel du Stock</h2>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
          </div>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                <strong>Erreur:</strong> {error}
              </div>
            )}

            {/* Product Search */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Produit *</label>
              <div className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setShowProductDropdown(true);
                    if (selectedProduct && e.target.value !== selectedProduct.productname) {
                      setSelectedProduct(null);
                      setProductId('');
                    }
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="🔍 Rechercher un produit..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-slate-800"
                />
                {selectedProduct && (
                  <button
                    type="button"
                    onClick={clearProduct}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Search Results Dropdown */}
              {showProductDropdown && products.length > 0 && !selectedProduct && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {products.map(p => (
                    <button
                      key={p.productid}
                      type="button"
                      onClick={() => selectProduct(p)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-purple-50 border-b border-slate-100 last:border-0"
                    >
                      <span className="font-medium text-slate-800">{p.productname}</span>
                      <span className="text-slate-400 ml-2">({p.productcode})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Product Badge */}
              {selectedProduct && (
                <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-600">✓</span>
                    <span className="text-sm font-medium text-purple-800">{selectedProduct.productname}</span>
                    <span className="text-xs text-purple-500">({selectedProduct.productcode})</span>
                  </div>

                  {/* Current Stock Display */}
                  {currentInventory && (
                    <div className="bg-white p-2 rounded-lg border border-purple-100">
                      <p className="text-xs text-slate-500 mb-2 font-medium">📊 Stock actuel:</p>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-purple-100 rounded p-1.5">
                          <p className="text-lg font-bold text-purple-700">{currentInventory.palettes}</p>
                          <p className="text-[10px] text-purple-600">Palettes</p>
                        </div>
                        <div className="bg-cyan-100 rounded p-1.5">
                          <p className="text-lg font-bold text-cyan-700">{currentInventory.cartons}</p>
                          <p className="text-[10px] text-cyan-600">Cartons</p>
                        </div>
                        <div className="bg-orange-100 rounded p-1.5">
                          <p className="text-lg font-bold text-orange-700">{currentInventory.pieces}</p>
                          <p className="text-[10px] text-orange-600">Pièces</p>
                        </div>
                        <div className="bg-blue-100 rounded p-1.5">
                          <p className="text-lg font-bold text-blue-700">{currentInventory.sqm.toFixed(2)}</p>
                          <p className="text-[10px] text-blue-600">m²</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Packaging Config (shown when product selected) */}
            {selectedProduct && (
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500 mb-2 font-medium">Ratios d'emballage</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">m²/pièce</label>
                    <input type="number" min="0.01" step="0.01" value={sqmPerPiece}
                      onChange={e => setSqmPerPiece(Number(e.target.value))}
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg text-center" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Pcs/Carton</label>
                    <input type="number" min="1" value={piecesPerCarton}
                      onChange={e => setPiecesPerCarton(Number(e.target.value))}
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg text-center" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Ctn/Palette</label>
                    <input type="number" min="1" value={cartonsPerPalette}
                      onChange={e => setCartonsPerPalette(Number(e.target.value))}
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg text-center" />
                  </div>
                </div>
              </div>
            )}

            {/* Adjustment Type */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="adjType" checked={adjustmentType === 'ADD'}
                  onChange={() => setAdjustmentType('ADD')}
                  className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">➕ Ajouter au stock</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="adjType" checked={adjustmentType === 'REMOVE'}
                  onChange={() => setAdjustmentType('REMOVE')}
                  className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">➖ Retirer du stock</span>
              </label>
            </div>

            {/* Pal/Ctn/Pcs/SQM Inputs */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-purple-700 mb-1">🎨 Palettes</label>
                <input type="number" min="0" step="any" value={palettes}
                  onChange={e => handlePalettesChange(Number(e.target.value))}
                  className="w-full p-2 border-2 border-purple-300 rounded-lg text-center font-bold text-purple-700 bg-purple-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-cyan-700 mb-1">📦 Cartons</label>
                <input type="number" min="0" step="any" value={cartons}
                  onChange={e => handleCartonsChange(Number(e.target.value))}
                  className="w-full p-2 border-2 border-cyan-300 rounded-lg text-center font-bold text-cyan-700 bg-cyan-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-orange-700 mb-1">🔢 Pièces</label>
                <input type="number" min="0" value={pieces}
                  onChange={e => handlePiecesChange(Number(e.target.value))}
                  className="w-full p-2 border-2 border-orange-300 rounded-lg text-center font-bold text-orange-700 bg-orange-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 mb-1">📐 Quantité (m²)</label>
                <input type="number" min="0" step="0.01" value={quantity}
                  onChange={e => handleQuantityChange(Number(e.target.value))}
                  className="w-full p-2 border-2 border-blue-400 rounded-lg text-center font-bold text-blue-700 bg-blue-50" />
              </div>
            </div>

            {/* Warehouse & Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Entrepôt *</label>
                <select value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))} required
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-slate-800">
                  <option value="">-- Sélectionner --</option>
                  {warehouses.map(w => <option key={w.warehouseid} value={w.warehouseid}>{w.warehousename}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Type *</label>
                <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value as 'OWNED' | 'CONSIGNMENT')} required
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-slate-800">
                  <option value="OWNED">Propre</option>
                  <option value="CONSIGNMENT">Consignation</option>
                </select>
              </div>
            </div>

            {ownershipType === 'CONSIGNMENT' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Usine *</label>
                <select value={factoryId} onChange={(e) => setFactoryId(Number(e.target.value))} required
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-slate-800">
                  <option value="">-- Sélectionner --</option>
                  {factories.map(f => <option key={f.factoryid} value={f.factoryid}>{f.factoryname}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Note / Raison</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Ex: Inventaire physique, correction d'erreur..."
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-slate-800" />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <div className="text-sm">
              {quantity > 0 && (
                <span className={`font-bold ${adjustmentType === 'ADD' ? 'text-green-600' : 'text-red-600'}`}>
                  {adjustmentType === 'ADD' ? '+' : '-'}{quantity.toFixed(2)} m²
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={isSaving}
                className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm">
                Annuler
              </button>
              <button type="submit" disabled={isSaving || quantity <= 0}
                className="bg-purple-600 text-white hover:bg-purple-700 px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2 disabled:opacity-50">
                {isSaving ? 'Sauvegarde...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- ImportStockModal Component ---
interface ImportStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File, warehouseId: number) => Promise<void>;
  isImporting: boolean;
}

function ImportStockModal({ isOpen, onClose, onImport, isImporting }: ImportStockModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('');
  const [warehouses, setWarehouses] = useState<{ warehouseid: number; warehousename: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setSelectedWarehouseId('');
      setError(null);
      api.getWarehouses().then(res => {
        if (res.success) {
          setWarehouses((res.data as { warehouseid: number; warehousename: string }[]) || []);
        } else {
          setError(res.message || "Failed to load warehouses.");
        }
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedFile) {
      setError("Veuillez sélectionner un fichier CSV.");
      return;
    }
    if (!selectedWarehouseId) {
      setError("Veuillez sélectionner un entrepôt.");
      return;
    }
    await onImport(selectedFile, Number(selectedWarehouseId));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">Importer Stock CSV</h2>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
          </div>

          <div className="p-6 grid grid-cols-1 gap-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                <strong>Erreur:</strong> {error}
              </div>
            )}

            <div>
              <label htmlFor="importFile" className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fichier CSV *</label>
              <input
                type="file"
                id="importFile"
                accept=".csv"
                onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-slate-800"
                required
              />
            </div>

            <div>
              <label htmlFor="importWarehouse" className="block text-xs font-semibold text-slate-500 uppercase mb-1">Entrepôt *</label>
              <select
                id="importWarehouse"
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-slate-800"
                required
              >
                <option value="">-- Sélectionner Entrepôt --</option>
                {warehouses.map(w => <option key={w.warehouseid} value={w.warehouseid}>{w.warehousename}</option>)}
              </select>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isImporting}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm">
              Annuler
            </button>
            <button type="submit" disabled={isImporting || !selectedFile || !selectedWarehouseId}
              className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2">
              {isImporting ? 'Importation...' : 'Importer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Main Page Component ---
function InventoryLevelsContent() {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get('filter');

  const [activeTab, setActiveTab] = useState<'WHOLESALE' | 'RETAIL'>('WHOLESALE');
  const [inventoryLevels, setInventoryLevels] = useState<InventoryLevel[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lowStockFilter, setLowStockFilter] = useState(filterParam === 'low');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [stockLevelFilter, setStockLevelFilter] = useState<'all' | 'low' | 'out'>('all');
  const router = useRouter();

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  // Import/Export State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // All brands for filter dropdown (fetched separately)
  const [allBrands, setAllBrands] = useState<string[]>([]);

  // Server-side sorting state
  const [sortBy, setSortBy] = useState<string>('productname');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Total count for pagination info
  const [totalCount, setTotalCount] = useState<number>(0);

  // Resizable columns
  const { widths, handleResize } = useColumnWidths('inventory-table', {
    productname: 200,
    warehousename: 120,
    brandname: 100,
    palletcount: 80,
    quantityonhand: 90,
    quantityreserved: 80,
    quantityavailable: 90,
  });

  // Server-side sort handler
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const getSortDirection = (key: string): 'asc' | 'desc' | null => {
    return sortBy === key ? sortDir : null;
  };

  // Data is now server-side filtered, so we just use inventoryLevels directly
  const filteredData = inventoryLevels;

  // Refetch when any filter or sort changes
  useEffect(() => {
    fetchInventoryLevels();
  }, [search, activeTab, brandFilter, stockLevelFilter, sortBy, sortDir]);

  // Fetch all brands on mount
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const response = await api.getBrands();
        if (response.success && response.data) {
          const brandNames = response.data.map((b: any) => b.brandname).filter(Boolean).sort();
          setAllBrands(brandNames);
        }
      } catch (error) {
        console.error('Error fetching brands:', error);
      }
    };
    fetchBrands();
  }, []);

  const fetchInventoryLevels = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const response = await api.getInventoryLevels({
        search,
        warehouseType: activeTab,
        brandFilter: brandFilter || undefined,
        stockLevel: stockLevelFilter,
        sortBy,
        sortDir,
        limit: 200 // Increase limit for better coverage
      });
      if (response.success) {
        setInventoryLevels((response.data as InventoryLevel[]) || []);
        setTotalCount((response as any).total || 0);
      } else {
        if (response.message?.includes('token') || response.message?.includes('Authentication required')) {
          router.push('/login');
        }
        throw new Error(response.message || 'Erreur inconnue');
      }
    } catch (error: any) {
      console.error('Erreur chargement inventaire:', error);
      setApiError(`Impossible de charger les niveaux de stock: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAdjustment = async (data: StockAdjustmentData) => {
    setIsSavingAdjustment(true);
    setAdjustmentError(null);
    try {
      const response = await api.adjustStock(data);
      if (response.success) {
        alert('Ajustement enregistré avec succès !');
        setIsAdjustModalOpen(false);
        fetchInventoryLevels();
      } else {
        if (response.message?.includes('token')) router.push('/login');
        throw new Error(response.message || 'Échec de l\'enregistrement');
      }
    } catch (error: any) {
      setAdjustmentError(error.message);
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setApiError(null);
    try {
      const blob = await api.exportStock();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error("Erreur d'export:", error);
      setApiError(`Échec de l'exportation: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportSubmit = async (file: File, warehouseId: number) => {
    setIsImporting(true);
    setApiError(null);

    try {
      const response = await api.importStock(file, warehouseId);
      if (response.success && response.data) {
        alert(`Importation terminée !\nSuccès: ${response.data.successful}\nÉchecs: ${response.data.failed}`);
        setIsImportModalOpen(false);
        fetchInventoryLevels();
      } else {
        throw new Error(response.message || "L'importation a échoué");
      }
    } catch (error: any) {
      console.error("Erreur d'import:", error);
      setApiError(`Échec de l'importation: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-7xl mx-auto">

        {/* --- Header --- */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Niveaux de Stock</h1>
            <p className="text-slate-500 text-sm mt-1">
              {activeTab === 'WHOLESALE' ? 'Entrepôts de Gros (Depots)' : 'Stock Détail (Magasins)'}
            </p>
          </div>

          {/* TABS */}
          <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
            <button
              onClick={() => setActiveTab('WHOLESALE')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${activeTab === 'WHOLESALE'
                ? 'bg-blue-100 text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              Stock Gros
            </button>
            <button
              onClick={() => setActiveTab('RETAIL')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${activeTab === 'RETAIL'
                ? 'bg-purple-100 text-purple-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              Stock Détail
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Import Button */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              disabled={isImporting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              {isImporting ? '...' : 'Import'}
            </button>

            {/* Export Excel Button */}
            <button
              onClick={() => {
                exportToExcel(
                  filteredData,
                  [
                    { key: 'productcode', label: 'Code' },
                    { key: 'productname', label: 'Produit' },
                    { key: 'warehousename', label: 'Entrepôt' },
                    { key: 'brandname', label: 'Marque' },
                    { key: 'palletcount', label: 'Palettes', format: formatQuantityExport },
                    { key: 'coliscount', label: 'Colis', format: formatQuantityExport },
                    { key: 'quantityonhand', label: 'Qté Totale', format: formatQuantityExport },
                    { key: 'quantityreserved', label: 'Réservé', format: formatQuantityExport },
                    { key: 'quantityavailable', label: 'Disponible', format: formatQuantityExport },
                  ],
                  `stock_${activeTab.toLowerCase()}`,
                  'Stock'
                );
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              📄 Excel
            </button>

            {/* Ajustement Button */}
            <button
              onClick={() => setIsAdjustModalOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              Ajustement
            </button>

            {/* Retours (Returns) Button */}
            <Link
              href="/inventory/returns"
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              Retours
            </Link>

            {/* Quick Stock Entry Button */}
            <Link
              href="/inventory/quick-stock"
              className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
              Entrée Stock
            </Link>

            {/* Back Button */}
            <Link
              href="/"
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Accueil
            </Link>
          </div>
        </div>

        {/* --- Error Display --- */}
        {apiError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* --- Search & Filters Bar --- */}
        <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search Input */}
            <div className="flex-1 min-w-[200px] relative">
              <input
                type="text"
                placeholder="🔍 Rechercher produit..."
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Brand Filter */}
            <div>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="p-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 min-w-[150px]"
              >
                <option value="">Toutes Marques</option>
                {allBrands.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>

            {/* Stock Level Filter Chips */}
            <div className="flex gap-2">
              <button
                onClick={() => setStockLevelFilter('all')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${stockLevelFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Tout
              </button>
              <button
                onClick={() => setStockLevelFilter('low')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${stockLevelFilter === 'low'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  }`}
              >
                ⚠️ Stock Faible
              </button>
              <button
                onClick={() => setStockLevelFilter('out')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${stockLevelFilter === 'out'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                  }`}
              >
                🚫 Rupture
              </button>
            </div>

            {/* Clear Filters */}
            {(brandFilter || stockLevelFilter !== 'all') && (
              <button
                onClick={() => { setBrandFilter(''); setStockLevelFilter('all'); }}
                className="text-red-600 hover:text-red-700 text-sm font-medium"
              >
                ✕ Effacer filtres
              </button>
            )}
          </div>

          {/* Results count */}
          <div className="mt-3 text-xs text-slate-500">
            {filteredData.length} article(s) affichés{totalCount > filteredData.length && <span className="text-slate-400"> sur {totalCount} total</span>}
            {brandFilter && <span className="ml-2">• Marque: <span className="font-medium text-indigo-600">{brandFilter}</span></span>}
            {stockLevelFilter !== 'all' && <span className="ml-2">• Filtre: <span className="font-medium">{stockLevelFilter === 'low' ? 'Stock Faible' : 'Rupture'}</span></span>}
            {sortBy !== 'productname' && <span className="ml-2">• Trié par: <span className="font-medium">{sortBy} ({sortDir})</span></span>}
          </div>
        </div>

        {/* --- Data Table Container --- */}
        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          {isLoading ? (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-500">Chargement des stocks...</p>
            </div>
          ) : inventoryLevels.length === 0 && !apiError ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-lg">Aucun stock trouvé.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                  <tr>
                    <ResizableSortableHeader label="Produit" sortKey="productname" currentDirection={getSortDirection('productname')} onSort={handleSort} width={widths.productname} onResize={handleResize} />
                    <ResizableSortableHeader label="Entrepôt" sortKey="warehousename" currentDirection={getSortDirection('warehousename')} onSort={handleSort} width={widths.warehousename} onResize={handleResize} />
                    <ResizableSortableHeader label="Marque" sortKey="brandname" currentDirection={getSortDirection('brandname')} onSort={handleSort} width={widths.brandname} onResize={handleResize} />
                    <ResizableSortableHeader label="Palettes" sortKey="palletcount" currentDirection={getSortDirection('palletcount')} onSort={handleSort} width={widths.palletcount} onResize={handleResize} align="right" />
                    <ResizableSortableHeader label="Total Qté" sortKey="quantityonhand" currentDirection={getSortDirection('quantityonhand')} onSort={handleSort} width={widths.quantityonhand} onResize={handleResize} align="right" />
                    <ResizableSortableHeader label="Réservé" sortKey="quantityreserved" currentDirection={getSortDirection('quantityreserved')} onSort={handleSort} width={widths.quantityreserved} onResize={handleResize} align="right" />
                    <ResizableSortableHeader label="Disponible" sortKey="quantityavailable" currentDirection={getSortDirection('quantityavailable')} onSort={handleSort} width={widths.quantityavailable} onResize={handleResize} align="right" />
                    <th scope="col" className="px-4 py-3 text-center" style={{ width: 80 }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((item) => (
                    <tr key={item.inventoryid} className="hover:bg-slate-50 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{item.productname}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{item.productcode}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{item.warehousename}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                          {item.brandname || 'Sans Marque'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {(item.palletcount || 0) > 0 && (
                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                              {formatQuantity(item.palletcount)} Palettes
                            </span>
                          )}
                          {(item.coliscount || 0) > 0 && (
                            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                              {formatQuantity(item.coliscount)} Colis
                            </span>
                          )}
                          {item.palletcount === 0 && item.coliscount === 0 && (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700 font-bold">{formatQuantity(item.quantityonhand)}</td>
                      <td className="px-6 py-4 text-right font-mono text-amber-600">{formatQuantity(item.quantityreserved)}</td>
                      <td className={`px-6 py-4 text-right font-mono font-bold ${(item.quantityavailable || 0) <= (item.reorderlevel || 0) ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatQuantity(item.quantityavailable)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link
                          href={`/inventory/transactions?productId=${item.productid}`}
                          className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-3 py-1 rounded transition font-medium text-xs"
                        >
                          Historique
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Render Modal */}
        <StockAdjustmentModal
          isOpen={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          onSave={handleSaveAdjustment}
          isSaving={isSavingAdjustment}
          error={adjustmentError}
        />

        <ImportStockModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImportSubmit}
          isImporting={isImporting}
        />
      </div>
    </div>
  );
}

export default function InventoryLevelsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-slate-500">Chargement de l'inventaire...</div>}>
      <InventoryLevelsContent />
    </Suspense>
  );
}
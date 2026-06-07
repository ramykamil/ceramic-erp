'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

const formatQty = (amount: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, amount || 0));

interface ProductEditModalProps {
  isOpen: boolean;
  product: any;
  brands: { brandid: number; brandname: string }[];
  units: { unitid: number; unitname: string; unitcode: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProductEditModal({ isOpen, product, brands, units, onClose, onSuccess }: ProductEditModalProps) {
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [newTotalQty, setNewTotalQty] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);

  useEffect(() => {
    if (isOpen && product) {
      const qty = Number(product.qteparcolis || 0);
      const isInteger = Math.abs(qty - Math.round(qty)) < 0.01 && qty > 0;
      setEditingProduct({
        ...product,
        packagingUnit: isInteger ? 'pcs' : 'm²'
      });
      setNewTotalQty('');
    } else {
      setEditingProduct(null);
      setNewTotalQty('');
    }
  }, [isOpen, product]);

  if (!isOpen || !editingProduct) return null;

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const res = await api.updateProduct(editingProduct.productid, {
        productcode: editingProduct.productcode,
        productname: editingProduct.productname,
        brandid: editingProduct.brandid || null,
        primaryunitid: editingProduct.primaryunitid || null,
        baseprice: editingProduct.prixvente,
        purchaseprice: editingProduct.prixachat,
        calibre: editingProduct.calibre,
        choix: editingProduct.choix,
        qteparcolis: editingProduct.qteparcolis,
        qtecolisparpalette: editingProduct.qtecolisparpalette,
      });
      if (res.success) {
        alert('✅ Produit mis à jour');
        onSuccess();
        onClose();
      } else {
        throw new Error(res.message || 'Échec de mise à jour');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjustQuantity = async () => {
    const currentQty = Number(editingProduct.totalqty || 0);
    const targetQty = parseFloat(newTotalQty.replace(',', '.'));
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
        setEditingProduct({ ...editingProduct, totalqty: targetQty });
        setNewTotalQty('');
        onSuccess();
      } else {
        throw new Error(res.message || 'Échec de l\'ajustement');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-800">Modifier Produit</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
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

          {/* Row 4: Calibre, Choix, Unité Primaire */}
          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Unité Primaire</label>
              <select
                value={editingProduct.primaryunitid || ''}
                onChange={e => setEditingProduct({ ...editingProduct, primaryunitid: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">-- Sélectionner --</option>
                {units.map(u => (
                  <option key={u.unitid} value={u.unitid}>{u.unitname} ({u.unitcode})</option>
                ))}
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
                    type="text"
                    inputMode="decimal"
                    value={newTotalQty}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^[0-9]*[.,]?[0-9]*$/.test(val)) {
                        setNewTotalQty(val);
                      }
                    }}
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
              {newTotalQty && !isNaN(parseFloat(newTotalQty.replace(',', '.'))) && (() => {
                const diff = parseFloat(newTotalQty.replace(',', '.')) - Number(editingProduct.totalqty || 0);
                if (Math.abs(diff) < 0.001) return (
                  <div className="text-xs text-slate-400 text-center">Aucun changement</div>
                );
                return (
                  <div className={`text-xs font-medium text-center py-1 px-2 rounded ${diff > 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                    {diff > 0 ? '↑' : '↓'} Différence: {diff > 0 ? '+' : ''}{formatQty(diff)}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 font-medium text-sm">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg"
          >
            Annuler
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={isSaving}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

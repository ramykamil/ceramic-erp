'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface ProductCreateModalProps {
  isOpen: boolean;
  brands: { brandid: number; brandname: string }[];
  units: { unitid: number; unitname: string; unitcode: string }[];
  warehouses: { warehouseid: number; warehousename: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProductCreateModal({ isOpen, brands, units, warehouses, onClose, onSuccess }: ProductCreateModalProps) {
  const [newProduct, setNewProduct] = useState({
    productcode: '',
    productname: '',
    brandid: 0,
    primaryunitid: 0,
    prixvente: 0,
    prixachat: 0,
    calibre: '',
    choix: '',
    qteparcolis: 0,
    qtecolisparpalette: 0,
    warehouseid: 0,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewProduct({
        productcode: `PROD-${Date.now()}`,
        productname: '',
        brandid: 0,
        primaryunitid: 0,
        prixvente: 0,
        prixachat: 0,
        calibre: '',
        choix: '',
        qteparcolis: 0,
        qtecolisparpalette: 0,
        warehouseid: 0,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
        brandid: newProduct.brandid || null,
        primaryunitid: newProduct.primaryunitid || null,
        baseprice: newProduct.prixvente,
        purchaseprice: newProduct.prixachat,
        calibre: newProduct.calibre,
        choix: newProduct.choix,
        qteparcolis: newProduct.qteparcolis,
        qtecolisparpalette: newProduct.qtecolisparpalette,
        warehouseid: newProduct.warehouseid,
      });
      if (res.success) {
        alert('✅ Produit créé avec succès');
        onSuccess();
        onClose();
      } else {
        throw new Error(res.message || 'Échec de création');
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900/60 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-slate-900/60 z-10">
          <h2 className="text-lg font-bold text-slate-100">➕ Nouveau Produit</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-400 text-2xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Code Produit *</label>
              <input
                type="text"
                value={newProduct.productcode}
                onChange={e => setNewProduct({ ...newProduct, productcode: e.target.value })}
                className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
                placeholder="Ex: PRD-001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Marque (Famille)</label>
              <select
                value={newProduct.brandid || ''}
                onChange={e => setNewProduct({ ...newProduct, brandid: Number(e.target.value) })}
                className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
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
              className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
              placeholder="Ex: CARRELAGE GRIS 60x60"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Choix</label>
              <select
                value={newProduct.choix}
                onChange={e => setNewProduct({ ...newProduct, choix: e.target.value })}
                className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
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
                value={newProduct.primaryunitid || ''}
                onChange={e => setNewProduct({ ...newProduct, primaryunitid: Number(e.target.value) })}
                className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
              >
                <option value="">-- Sélectionner --</option>
                {units.map(u => (
                  <option key={u.unitid} value={u.unitid}>{u.unitname} ({u.unitcode})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Prix Vente (DZD)</label>
              <input
                type="number"
                onWheel={(e) => e.currentTarget.blur()}
                value={newProduct.prixvente || ''}
                onChange={e => setNewProduct({ ...newProduct, prixvente: Number(e.target.value) })}
                className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
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
                className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
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
              className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
              placeholder="Ex: C1, 01"
            />
          </div>

          {/* Packaging Section */}
          <div className="border-t border-white/[0.06] pt-4 mt-4">
            <h3 className="text-sm font-bold text-slate-200 mb-3">📦 Emballage</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Qté par Colis (pcs ou m²)</label>
                <input
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  step="0.01"
                  value={newProduct.qteparcolis ?? ''}
                  onChange={e => setNewProduct({ ...newProduct, qteparcolis: Number(e.target.value) })}
                  className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
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
                  className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
                  placeholder="Ex: 48"
                />
              </div>
            </div>
          </div>

          {/* Warehouse Selection */}
          <div className="border-t border-white/[0.06] pt-4 mt-4">
            <h3 className="text-sm font-bold text-slate-200 mb-3">🏭 Entrepôt Initial *</h3>
            <select
              value={newProduct.warehouseid || ''}
              onChange={e => setNewProduct({ ...newProduct, warehouseid: Number(e.target.value) })}
              className="w-full p-2.5 border border-white/[0.08] rounded-lg text-sm"
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
        <div className="p-4 bg-slate-900/40 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 font-medium text-sm">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="bg-slate-900/60 border border-white/[0.08] text-slate-200 hover:bg-slate-900/40 px-4 py-2 rounded-lg"
          >
            Annuler
          </button>
          <button
            onClick={handleCreateProduct}
            disabled={isSaving}
            className="bg-emerald-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {isSaving ? 'Création...' : 'Créer Produit'}
          </button>
        </div>
      </div>
    </div>
  );
}

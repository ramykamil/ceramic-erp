'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// --- Interfaces ---
interface Brand {
  brandid: number;
  brandname: string;
  description: string | null;
  isactive: boolean;
  initialbalance?: number;
  currentbalance?: number;
}

interface BrandFormData {
  brandname: string;
  description?: string;
  isactive?: boolean;
  initialBalance?: number;
}

// --- Modal Component ---
interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: BrandFormData, brandId: number | null) => Promise<void>;
  initialData: Brand | null;
  isSaving: boolean;
}

function BrandModal({ isOpen, onClose, onSave, initialData, isSaving }: BrandModalProps) {
  const [formData, setFormData] = useState<BrandFormData>({ brandname: '', description: '', isactive: true });
  const isEditing = Boolean(initialData);

  useEffect(() => {
    if (initialData) {
      setFormData({
        brandname: initialData.brandname || '',
        description: initialData.description || '',
        isactive: initialData.isactive !== undefined ? initialData.isactive : true,
        initialBalance: initialData.initialbalance, // Need to ensure lowercase match with API
      });
    } else {
      setFormData({ brandname: '', description: '', isactive: true, initialBalance: 0 });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: newValue }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData, initialData?.brandid ?? null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-semibold text-slate-800">
              {isEditing ? 'Modifier la Marque' : 'Ajouter une Nouvelle Marque'}
            </h2>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            <div>
              <label htmlFor="brandname" className="block text-sm font-medium text-slate-700 mb-1.5">Nom de la Marque *</label>
              <input
                type="text"
                id="brandname"
                name="brandname"
                value={formData.brandname}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm"
                placeholder="Ex: Ceramex"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1.5">Description (Optionnel)</label>
              <textarea
                id="description"
                name="description"
                value={formData.description || ''}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm resize-none"
                placeholder="Description courte..."
              />
            </div>

            <div>
              <label htmlFor="initialBalance" className="block text-sm font-medium text-slate-700 mb-1.5">Ancien Crédit (Dette Initiale)</label>
              <div className="relative">
                <input
                  type="number"
                  id="initialBalance"
                  name="initialBalance"
                  step="0.01"
                  value={formData.initialBalance || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm pr-12 text-right font-mono"
                  placeholder="0.00"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-slate-500 sm:text-sm">DA</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">Dette existante avant l'utilisation du système.</p>
            </div>
            {isEditing && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <input
                  id="isactive"
                  name="isactive"
                  type="checkbox"
                  checked={formData.isactive}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="isactive" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                  Marque Active
                </label>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isSaving ? 'Sauvegarde...' : (isEditing ? 'Mettre à Jour' : 'Ajouter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Main Page Component ---
export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const response = await api.getBrands();
      if (response.success) {
        setBrands((response.data as Brand[]) || []);
      } else {
        if (response.message?.includes('token') || response.message?.includes('Authentication required')) {
          router.push('/login');
        }
        throw new Error(response.message || 'Erreur inconnue');
      }
    } catch (error: any) {
      console.error('Erreur chargement marques:', error);
      setApiError(`Impossible de charger les marques: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingBrand(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (brand: Brand) => {
    setEditingBrand(brand);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBrand(null);
  };

  const handleSaveBrand = async (formData: BrandFormData, brandId: number | null) => {
    setIsSaving(true);
    setApiError(null);
    try {
      let response;
      const dataToSend = {
        brandName: formData.brandname,
        description: formData.description,
        isActive: formData.isactive,
        initialBalance: formData.initialBalance
      };

      if (brandId) {
        const { brandName, ...updateData } = dataToSend;
        response = await api.updateBrand(brandId, { ...updateData, brandName: formData.brandname });
      } else {
        response = await api.createBrand(dataToSend);
      }

      if (response.success) {
        handleCloseModal();
        fetchBrands();
      } else {
        if (response.message?.includes('token')) router.push('/login');
        if (response.message?.includes('existe déjà')) {
          throw new Error("Ce nom de marque existe déjà.");
        }
        throw new Error(response.message || `Échec ${brandId ? 'modification' : 'ajout'}`);
      }
    } catch (error: any) {
      console.error("Erreur sauvegarde marque:", error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBrand = async (brandId: number) => {
    if (!confirm(`Êtes-vous sûr de vouloir désactiver cette marque ?`)) {
      return;
    }
    setApiError(null);
    try {
      const response = await api.deleteBrand(brandId);
      if (response.success) {
        fetchBrands();
      } else {
        if (response.message?.includes('token')) router.push('/login');
        throw new Error(response.message || 'Échec de la désactivation');
      }
    } catch (error: any) {
      console.error('Erreur désactivation marque:', error);
      alert(`Erreur: ${error.message}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-7xl mx-auto">

        {/* --- Header --- */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Gestion des Marques</h1>
            <p className="text-slate-500 text-sm mt-1">Administrez le catalogue des marques et fournisseurs</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Nouvelle Marque
            </button>

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
        {apiError && !isModalOpen && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* --- Data Table Container --- */}
        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          {isLoading ? (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-500">Chargement des marques...</p>
            </div>
          ) : brands.length === 0 && !apiError ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-lg">Aucune marque trouvée.</p>
              <button onClick={handleOpenAddModal} className="mt-2 text-blue-600 hover:underline text-sm">
                Ajouter votre première marque
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                  <tr>
                    <th scope="col" className="px-6 py-4">ID</th>
                    <th scope="col" className="px-6 py-4">Nom</th>
                    <th scope="col" className="px-6 py-4 text-right">Ancien Crédit</th>
                    <th scope="col" className="px-6 py-4 text-right">Solde Actuel</th>
                    <th scope="col" className="px-6 py-4 text-center">Statut</th>
                    <th scope="col" className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {brands.map((brand) => (
                    <tr key={brand.brandid} className={`hover:bg-slate-50 transition-colors duration-150 ${!brand.isactive ? 'bg-slate-50/50' : ''}`}>
                      <td className="px-6 py-4 font-mono text-slate-500 text-xs">{brand.brandid}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{brand.brandname}</td>
                      <td className="px-6 py-4 text-right font-mono text-amber-600 text-xs">
                        {brand.initialbalance ? Number(brand.initialbalance).toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-700 text-xs">
                        {Number(brand.currentbalance || 0).toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${brand.isactive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                          {brand.isactive ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={() => handleOpenEditModal(brand)}
                            className="text-blue-600 hover:text-blue-800 font-medium text-xs transition"
                          >
                            Modifier
                          </button>
                          <span className="text-slate-300">|</span>
                          {brand.isactive ? (
                            <button
                              onClick={() => handleDeleteBrand(brand.brandid)}
                              className="text-red-500 hover:text-red-700 font-medium text-xs transition"
                            >
                              Désactiver
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSaveBrand({ brandname: brand.brandname, isactive: true }, brand.brandid)}
                              className="text-emerald-600 hover:text-emerald-800 font-medium text-xs transition"
                            >
                              Réactiver
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

        {/* Modale */}
        <BrandModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSave={handleSaveBrand}
          initialData={editingBrand}
          isSaving={isSaving}
        />

      </div>
    </div>
  );
}
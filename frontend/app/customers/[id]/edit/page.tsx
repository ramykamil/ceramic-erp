'use client';

import { useState, useEffect, Suspense } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation'; // Importez useParams

// ... (Interface PriceList et CustomerFormData restent les mêmes que 'new') ...
// Interface pour les listes de prix (dropdown)
interface PriceList {
  pricelistid: number;
  pricelistname: string;
}

// Interface pour les données du formulaire
interface CustomerFormData {
  customerCode: string;
  customerName: string;
  customerType: 'RETAIL' | 'WHOLESALE' | 'BOTH';
  priceListId: number | '';
  phone: string;
  email: string;
  address: string;
  // creditLimit: number | ''; // <-- RETIRÉ
  paymentTerms: string;
  isActive: boolean; // Ajout pour modification
  currentBalance?: number;
}

// --- Composant Interne pour la Logique ---
function EditCustomerForm() {
  const router = useRouter();
  const params = useParams(); // Pour obtenir l'ID
  const customerId = parseInt(params.id as string);

  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [formData, setFormData] = useState<Partial<CustomerFormData>>({ // Partiel car chargé
    customerCode: '',
    customerName: '',
    priceListId: '',
    phone: '',
    email: '',
    address: '',
    // creditLimit: 0, // <-- RETIRÉ
    paymentTerms: '',
    isActive: true,
    currentBalance: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Chargement des listes de prix ET des données client existantes
  useEffect(() => {
    if (!customerId) return;
    setIsLoading(true);
    Promise.all([
      api.getPriceLists(),
      api.getCustomer(customerId) // Récupère les détails du client
    ]).then(([priceListRes, customerRes]) => {
      // Gestion des erreurs
      if (!priceListRes.success) throw new Error(priceListRes.message || 'Erreur listes de prix');
      if (!customerRes.success) throw new Error(customerRes.message || 'Erreur client');
      if (priceListRes.message?.includes('token') || customerRes.message?.includes('token')) {
        router.push('/login');
        throw new Error('Session expirée');
      }

      const priceListData = Array.isArray(priceListRes.data) ? priceListRes.data : [];
      setPriceLists(priceListData);
      // Pré-remplir le formulaire avec les données existantes
      const customerData = customerRes.data as CustomerFormData & { pricelistid: number, isactive: boolean };
      setFormData({
        customerCode: customerData.customerCode || '',
        customerName: customerData.customerName || '',
        customerType: customerData.customerType || 'WHOLESALE',
        priceListId: customerData.pricelistid || '',
        phone: customerData.phone || '',
        email: customerData.email || '',
        address: customerData.address || '',
        // creditLimit: customerData.creditlimit || 0, // <-- RETIRÉ
        paymentTerms: customerData.paymentTerms || 'NET30',
        isActive: customerData.isactive !== undefined ? customerData.isactive : true,
      });

    }).catch((error: any) => {
      console.error("Erreur chargement:", error);
      setApiError(error.message);
    }).finally(() => setIsLoading(false));
  }, [customerId, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

    setFormData(prev => ({
      ...prev,
      [name]: (name === 'priceListId' /* || name === 'creditLimit' <-- RETIRÉ */) && newValue !== ''
        ? Number(newValue)
        : newValue
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setApiError(null);

    // Prépare les données pour l'API (basé sur le contrôleur 'updateCustomer')
    const dataToSend = {
      customerName: formData.customerName,
      // customerType: formData.customerType, // Ne pas envoyer si on ne le change pas
      priceListId: formData.priceListId === '' ? null : formData.priceListId,
      contactPerson: null, // Le formulaire n'a pas ce champ, envoyer null ou l'ajouter
      phone: formData.phone || null,
      email: formData.email || null,
      address: formData.address || null,
      taxId: null, // Le formulaire n'a pas ce champ
      // creditLimit: formData.creditLimit === '' ? 0 : formData.creditLimit, // <-- RETIRÉ
      paymentTerms: formData.paymentTerms || null,
      isActive: formData.isActive,
      currentBalance: (formData.currentBalance !== undefined && formData.currentBalance !== null) ? formData.currentBalance : null,
    };

    try {
      const response = await api.updateCustomer(customerId, dataToSend); // Appel de MISE A JOUR
      if (response.success) {
        alert(`Client '${formData.customerName}' mis à jour avec succès !`);
        router.push('/customers'); // Redirige vers la liste
      } else {
        if (response.message?.includes('token')) router.push('/login');
        if (response.message?.includes('already exists')) {
          throw new Error(`Le code client '${formData.customerCode}' existe déjà.`);
        }
        throw new Error(response.message || 'La mise à jour a échoué');
      }
    } catch (error: any) {
      console.error("Erreur mise à jour client:", error);
      setApiError(`Erreur: ${error.message}`);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="p-8 text-center text-slate-500">Chargement du client...</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="glassy-container p-6 sm:p-8 space-y-6">

        {/* Infos Principales */}
        <div className="border-b border-slate-200/50 pb-6">
          <h2 className="text-xl font-semibold text-slate-700 mb-4">Informations Principales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="customerCode" className="block text-sm font-medium text-slate-700 mb-1">Code Client (Non modifiable)</label>
              <input type="text" id="customerCode" name="customerCode" value={formData.customerCode} disabled
                className="w-full p-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-500" />
            </div>
            <div>
              <label htmlFor="customerName" className="block text-sm font-medium text-slate-700 mb-1">Nom Client *</label>
              <input type="text" id="customerName" name="customerName" value={formData.customerName} onChange={handleChange} required
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
            </div>
          </div>
        </div>

        {/* Infos Contact */}
        <div className="border-b border-slate-200/50 pb-6">
          <h2 className="text-xl font-semibold text-slate-700 mb-4">Contact</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
              <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" id="email" name="email" value={formData.email} onChange={handleChange}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="address" className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
              <textarea id="address" name="address" value={formData.address} onChange={handleChange} rows={3}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
            </div>
          </div>
        </div>

        {/* Infos Financières */}
        <div>
          <h2 className="text-xl font-semibold text-slate-700 mb-4">Détails Commerciaux</h2>
          {/* Grille modifiée pour 2 colonnes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="priceListId" className="block text-sm font-medium text-slate-700 mb-1">Liste de Prix par Défaut *</label>
              <select id="priceListId" name="priceListId" value={formData.priceListId} onChange={handleChange} required
                className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80">
                <option value="">-- Sélectionner --</option>
                {priceLists.map(pl => <option key={pl.pricelistid} value={pl.pricelistid}>{pl.pricelistname}</option>)}
              </select>
            </div>
            {/* CHAMP LIMITE DE CRÉDIT RETIRÉ */}
            {/*
                <div>
                    <label htmlFor="creditLimit" ... >Limite de Crédit (DZD)</label>
                    <input type="number" id="creditLimit" ... />
                </div>
                */}
            <div className="md:col-span-2 flex items-center">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                checked={formData.isActive}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-slate-700">
                Client Actif
              </label>
            </div>
          </div>
        </div>

        {/* --- NOUVEAU: Modification Solde --- */}
        <div className="border-t border-slate-200/50 pt-6">
          <h2 className="text-xl font-semibold text-slate-700 mb-4">Solde & Comptabilité</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="currentBalance" className="block text-sm font-medium text-slate-700 mb-1">Ancien Solde (DZD)</label>
              <div className="relative">
                <input type="number" step="0.01" id="currentBalance" name="currentBalance"
                  value={formData.currentBalance || ''} onChange={handleChange}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-orange-50" />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-slate-500 sm:text-sm">DZD</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">Attention: Modifier ce montant affecte la dette du client.</p>
            </div>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex justify-end gap-4 border-t border-slate-200/50 pt-6">
          <Link href="/customers" className="bg-slate-200 text-slate-700 hover:bg-slate-300 px-5 py-2 rounded-lg font-medium text-sm transition">
            Annuler
          </Link>
          <button type="submit" disabled={isSaving}
            className="bg-blue-600 text-white hover:bg-blue-700 px-5 py-2 rounded-lg font-medium text-sm transition disabled:opacity-50">
            {isSaving ? 'Sauvegarde...' : 'Mettre à Jour Client'}
          </button>
        </div>
      </div>
    </form>
  );
}

// --- Composant Page Parent (pour Suspense) ---
export default function EditCustomerPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* En-tête */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-blue-800">Modifier Client</h1>
          <Link href="/customers" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            ← Retour à la Liste
          </Link>
        </div>
        {/* Suspense est requis car EditCustomerForm utilise useParams/useSearchParams */}
        <Suspense fallback={<p className="text-center py-12 text-slate-500">Chargement...</p>}>
          <EditCustomerForm />
        </Suspense>
      </div>
    </div>
  );
}
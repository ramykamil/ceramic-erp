'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Interface pour les listes de prix (dropdown)
interface PriceList {
  pricelistid: number;
  pricelistname: string;
}

// Interface pour les données du formulaire
interface CustomerFormData {
  customerCode: string; //
  customerName: string; //
  customerType: 'RETAIL' | 'WHOLESALE' | 'BOTH'; //
  priceListId: number | ''; //
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  // Legal / Fiscal fields
  rc: string;  // Registre de Commerce
  ai: string;  // Article d'Imposition
  nif: string; // Numéro d'Identification Fiscale
  nis: string; // Numéro d'Identification Statistique
  rib: string; // Relevé d'Identité Bancaire
  ancienSolde: number | ''; // Ancien Solde (initialise CurrentBalance)
}

// --- Composant Page ---
export default function NewCustomerPage() {
  const router = useRouter();

  // États pour les listes déroulantes
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);

  // État pour le formulaire
  const [formData, setFormData] = useState<CustomerFormData>({
    customerCode: '',
    customerName: '',
    customerType: 'WHOLESALE', // Par défaut 'WHOLESALE'
    priceListId: '',
    phone: '',
    email: '',
    address: '',
    paymentTerms: 'NET30', // Par défaut
    rc: '',
    ai: '',
    nif: '',
    nis: '',
    rib: '',
    ancienSolde: '',
  });

  // États de chargement/erreur
  const [isLoading, setIsLoading] = useState(true); // Chargement des listes de prix
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Chargement des listes de prix au montage
  useEffect(() => {
    setFormData(prev => ({ ...prev, customerCode: `CUST-${Date.now()}` }));
    setIsLoading(true);
    api.getPriceLists()
      .then(res => {
        if (res.success) {
          // Ensure that we only set an array to the state
          const priceListData = Array.isArray(res.data) ? res.data : [];
          setPriceLists(priceListData);
        } else {
          if (res.message?.includes('token')) router.push('/login');
          throw new Error(res.message || 'Erreur chargement listes de prix');
        }
      })
      .catch((error: any) => {
        console.error("Erreur chargement:", error);
        setApiError(error.message);
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      // Convertit les champs numériques si nécessaire
      [name]: (name === 'priceListId' || name === 'ancienSolde') && value !== ''
        ? Number(value)
        : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setApiError(null);

    // Prépare les données pour l'API (convertit les champs vides en null/0)
    const dataToSend = {
      ...formData,
      customerType: 'WHOLESALE', // Forcer 'WHOLESALE'
      priceListId: formData.priceListId === '' ? null : formData.priceListId,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      paymentTerms: formData.paymentTerms || null,
      rc: formData.rc || null,
      ai: formData.ai || null,
      nif: formData.nif || null,
      nis: formData.nis || null,
      rib: formData.rib || null,
      ancienSolde: formData.ancienSolde === '' ? 0 : formData.ancienSolde,
    };

    try {
      // POST /customers est protégé
      const response = await api.createCustomer(dataToSend); //

      if (response.success) {
        alert(`Client '${formData.customerName}' créé avec succès !`);
        router.push('/customers'); // Redirige vers la liste des clients
      } else {
        if (response.message?.includes('token')) router.push('/login');
        // Gère l'erreur de code client dupliqué
        if (response.message?.includes('already exists') || response.message?.includes('existe déjà')) {
          throw new Error(`Le code client '${formData.customerCode}' existe déjà.`);
        }
        throw new Error(response.message || 'La création a échoué');
      }
    } catch (error: any) {
      console.error("Erreur création client:", error);
      setApiError(`Erreur: ${error.message}`);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="p-8 text-center text-slate-500">Chargement du formulaire...</p>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* En-tête */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-blue-800">Ajouter un Nouveau Client</h1>
          <Link href="/customers" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            ← Annuler (Retour Liste)
          </Link>
        </div>

        {/* Affichage Erreur API */}
        {apiError && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit}>
          <div className="glassy-container p-6 sm:p-8 space-y-6">

            {/* Infos Principales */}
            <div className="border-b border-slate-200/50 pb-6">
              <h2 className="text-xl font-semibold text-slate-700 mb-4">Informations Principales</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="customerCode" className="block text-sm font-medium text-slate-700 mb-1">Code Client *</label>
                  <input type="text" id="customerCode" name="customerCode" value={formData.customerCode} onChange={handleChange} required
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
                  <p className="text-xs text-slate-500 mt-1">Identifiant unique (ex: CUST-001).</p>
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

            {/* Infos Financières (pour Wholesale) */}
            <div className="border-b border-slate-200/50 pb-6">
              <h2 className="text-xl font-semibold text-slate-700 mb-4">Détails Commerciaux</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="priceListId" className="block text-sm font-medium text-slate-700 mb-1">Liste de Prix par Défaut *</label>
                  <select id="priceListId" name="priceListId" value={formData.priceListId} onChange={handleChange} required
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80">
                    <option value="">-- Sélectionner --</option>
                    {priceLists.map(pl => <option key={pl.pricelistid} value={pl.pricelistid}>{pl.pricelistname}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="ancienSolde" className="block text-sm font-medium text-slate-700 mb-1">
                    Ancien Solde (DZD)
                    <span className="text-xs text-blue-500 ml-1">(Initialise le solde courant)</span>
                  </label>
                  <input type="number" id="ancienSolde" name="ancienSolde" value={formData.ancienSolde} onChange={handleChange}
                    placeholder="0.00" step="0.01"
                    className="w-full p-2 border border-blue-300 rounded-lg bg-blue-50 bg-opacity-80" />
                </div>
              </div>
            </div>

            {/* Informations Légales / Fiscales */}
            <div>
              <h2 className="text-xl font-semibold text-slate-700 mb-4">Informations Légales / Fiscales</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rc" className="block text-sm font-medium text-slate-700 mb-1">RC (Registre de Commerce)</label>
                  <input type="text" id="rc" name="rc" value={formData.rc} onChange={handleChange}
                    placeholder="Ex: 04/00-0406435822"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
                </div>
                <div>
                  <label htmlFor="nif" className="block text-sm font-medium text-slate-700 mb-1">NIF (N° Identification Fiscale)</label>
                  <input type="text" id="nif" name="nif" value={formData.nif} onChange={handleChange}
                    placeholder="Ex: 002204040643550"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
                </div>
                <div>
                  <label htmlFor="ai" className="block text-sm font-medium text-slate-700 mb-1">AI (Article d'Imposition)</label>
                  <input type="text" id="ai" name="ai" value={formData.ai} onChange={handleChange}
                    placeholder="Ex: 04010492431"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
                </div>
                <div>
                  <label htmlFor="nis" className="block text-sm font-medium text-slate-700 mb-1">NIS (N° Identification Statistique)</label>
                  <input type="text" id="nis" name="nis" value={formData.nis} onChange={handleChange}
                    placeholder="Ex: 0024040406435"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="rib" className="block text-sm font-medium text-slate-700 mb-1">RIB (Relevé d'Identité Bancaire)</label>
                  <input type="text" id="rib" name="rib" value={formData.rib} onChange={handleChange}
                    placeholder="Ex: 00012 00720 00123456789 53"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white bg-opacity-80" />
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
                {isSaving ? 'Sauvegarde...' : 'Enregistrer Client'}
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
}
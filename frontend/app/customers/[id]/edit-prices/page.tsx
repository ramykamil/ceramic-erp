'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';

// Interface for a product in the list
interface Product {
  productid: number;
  productcode: string;
  productname: string;
  baseprice: number;
}

// Interface for existing specific prices
interface CustomerPrice {
  productid: number;
  specificprice: number;
}

interface BulkSetResponseData {
  successful: number;
  failed: number;
  errors: any[];
}

// Interface for the merged data shown in the table
interface PriceEditorRow {
  productId: number;
  productCode: string;
  productName: string;
  basePrice: number;
  specificPrice: string; // Use string for input field
}

// Fonction pour formater la devise en DZD (lecture seule)
const formatCurrencyDZD = (amount: number | null | undefined): string => {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount)) {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(0);
  }
  return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(numericAmount);
};

// --- Composant Page ---
export default function BulkPriceEditorPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = parseInt(params.id as string);

  const [customer, setCustomer] = useState<{ customername: string } | null>(null);
  const [rows, setRows] = useState<PriceEditorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [filter, setFilter] = useState(''); // State for search filter

  useEffect(() => {
    if (!customerId) return;
    setIsLoading(true);
    setApiError(null);

    // Fetch customer details, all products, and current prices
    Promise.all([
      api.getCustomer(customerId),
      api.getProducts({ limit: 2000 }), // Get a large list of products
      api.getCustomerPrices(customerId) // Get existing prices
    ]).then(([customerRes, productsRes, pricesRes]) => {
      // Handle auth errors
      if ([customerRes, productsRes, pricesRes].some(res => res.message?.includes('token'))) {
        router.push('/login');
        throw new Error('Session expirée');
      }
      
      if (!customerRes.success) throw new Error(customerRes.message || 'Client non trouvé');
      if (!productsRes.success) throw new Error(productsRes.message || 'Produits non chargés');
      if (!pricesRes.success) throw new Error(pricesRes.message || 'Prix non chargés');

      setCustomer(customerRes.data as { customername: string } || null);
      const allProducts: Product[] = (productsRes.data as Product[]) || [];
      const currentPrices: CustomerPrice[] = (pricesRes.data as CustomerPrice[]) || [];

      // Create a Map for quick lookup of existing prices
      const priceMap = new Map(currentPrices.map(p => [p.productid, p.specificprice]));

      // Merge all products with their current specific prices
      const mergedRows = allProducts.map(product => ({
        productId: product.productid,
        productCode: product.productcode,
        productName: product.productname,
        basePrice: product.baseprice,
        // Set specificPrice to the existing price, or an empty string
        specificPrice: priceMap.has(product.productid)
          ? String(priceMap.get(product.productid)) // Convert to string for input
          : ''
      }));

      setRows(mergedRows);
    }).catch((error: any) => {
      console.error('Erreur chargement données:', error);
      setApiError(`Erreur: ${error.message}`);
    }).finally(() => {
      setIsLoading(false);
    });

  }, [customerId, router]);

  // Handle input change in the table
  const handlePriceChange = (productId: number, newPrice: string) => {
    setRows(currentRows =>
      currentRows.map(row =>
        row.productId === productId ? { ...row, specificPrice: newPrice } : row
      )
    );
  };

  // Handle Save
  const handleSave = async () => {
    setIsSaving(true);
    setApiError(null);

    // Filter rows to only send items that have a specific price entered
    const pricesToSave = rows
      .filter(row => row.specificPrice !== '' && !isNaN(parseFloat(row.specificPrice)))
      .map(row => ({
        productId: row.productId,
        specificPrice: parseFloat(row.specificPrice)
      }));

    if (pricesToSave.length === 0) {
      alert("Aucun prix spécifique n'a été saisi.");
      setIsSaving(false);
      return;
    }

    try {
      const response = await api.bulkSetCustomerPrices(customerId, pricesToSave);
      const responseData = response.data as BulkSetResponseData;
      if (response.success && responseData) {
         alert(`Mise à jour terminée !\nSuccès: ${responseData.successful}\nÉchecs: ${responseData.failed}`);
         if (responseData.failed > 0) {
             console.error("Erreurs de sauvegarde:", responseData.errors);
             setApiError(`Mise à jour terminée avec ${responseData.failed} erreur(s).`);
         } else {
            router.push(`/customers/${customerId}`); // Redirect back on full success
         }
      } else {
        throw new Error(response.message || 'La sauvegarde a échoué');
      }
    } catch (error: any) {
      console.error('Erreur sauvegarde:', error);
      setApiError(`Erreur: ${error.message}`);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Filter rows for display based on search
  const filteredRows = rows.filter(row =>
    row.productName.toLowerCase().includes(filter.toLowerCase()) ||
    row.productCode.toLowerCase().includes(filter.toLowerCase())
  );

  if (isLoading) {
    return <p className="p-8 text-center text-slate-500">Chargement de l'éditeur de prix...</p>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* En-tête */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-blue-800">Éditeur de Prix en Masse</h1>
          <p className="text-slate-600 text-lg mt-1">
            Pour le client : <span className="font-semibold">{customer?.customername || '...'}</span>
          </p>
        </div>
        
        {/* Barre d'Actions */}
        <div className="glassy-container p-4 mb-6 flex flex-wrap justify-between items-center gap-4">
           <input
                type="text"
                placeholder="Filtrer produits par nom ou code..."
                className="w-full md:w-1/2 p-2 border border-slate-300 rounded-lg bg-white bg-opacity-70"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
            />
            <div className="flex gap-3">
                <Link href={`/customers/${customerId}`} className="bg-slate-200 text-slate-700 hover:bg-slate-300 px-4 py-2 rounded-lg font-medium text-sm transition">
                    Annuler
                </Link>
                 <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg font-medium text-sm transition disabled:opacity-50 inline-flex items-center gap-2"
                >
                    <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.7a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd" /></svg>
                    {isSaving ? 'Sauvegarde...' : 'Enregistrer les Prix'}
                 </button>
            </div>
        </div>

        {/* Affichage Erreur API */}
        {apiError && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg">
            <strong>Erreur:</strong> {apiError}
          </div>
        )}

        {/* Tableau Éditeur de Prix */}
        <div className="glassy-container overflow-hidden">
            <div className="overflow-y-auto max-h-[70vh]"> {/* Makes only the table body scrollable */}
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100 font-semibold sticky top-0">
                  <tr>
                    <th scope="col" className="px-6 py-3 w-1/3">Produit</th>
                    <th scope="col" className="px-6 py-3 w-1/4">Code</th>
                    <th scope="col" className="px-6 py-3 w-1/4 text-right">Prix de Base</th>
                    <th scope="col" className="px-6 py-3 w-1/3 text-center">Prix Spécifique (DZD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRows.map((row) => (
                    <tr key={row.productId} className="hover:bg-blue-50/50">
                      <td className="px-6 py-2 font-medium text-slate-900">{row.productName}</td>
                      <td className="px-6 py-2 font-mono">{row.productCode}</td>
                      <td className="px-6 py-2 text-right text-slate-500">{formatCurrencyDZD(row.basePrice)}</td>
                      <td className="px-6 py-2">
                        <input
                          type="number"
                          value={row.specificPrice}
                          onChange={(e) => handlePriceChange(row.productId, e.target.value)}
                          placeholder="Par défaut"
                          min="0"
                          step="0.01"
                          className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white bg-opacity-80 text-right font-medium"
                        />
                      </td>
                    </tr>
                  ))}
                   {filteredRows.length === 0 && (
                        <tr>
                            <td colSpan={4} className="text-center py-10 text-slate-500">
                                Aucun produit ne correspond à votre filtre.
                            </td>
                        </tr>
                    )}
                </tbody>
              </table>
            </div>
        </div>
        
      </div>
    </div>
  );
}
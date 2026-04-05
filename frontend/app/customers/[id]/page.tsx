'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';

// Interfaces
interface Customer {
  customerid: number;
  customercode: string;
  customername: string;
  customertype: string;
  pricelistname: string | null;
  currentbalance: number; // Added
}

interface CustomerPrice {
  productid: number;
  productcode: string;
  productname: string;
  specificprice: number;
  baseprice: number;
  effectivefrom?: string;
}

interface Brand { brandid: number; brandname: string; }

interface Rule {
  ruleid: number;
  brandid: number;
  brandname: string;
  size: string;
  specificprice: number; // API returns specificprice
  price?: number; // For compatibility if API varies
}

interface SituationItem {
  id: number;
  date: string;
  reference: string;
  type: string;
  amount: number;
  debit: number;
  credit: number;
  status: string;
  paymentmethod: string | null;
}

interface SituationSummary {
  totalDebit: number;
  totalCredit: number;
  periodBalance: number;
  globalBalance: number;
}

// Helper
const formatCurrencyDZD = (amount: number): string => {
  return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount || 0);
};

const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('fr-FR');
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = parseInt(params.id as string);
  const initialTab = searchParams.get('tab') === 'situation' ? 'situation' : 'pricing';
  const [activeTab, setActiveTab] = useState<'pricing' | 'situation'>(initialTab);

  const [customer, setCustomer] = useState<Customer | null>(null);

  // Pricing State
  const [prices, setPrices] = useState<CustomerPrice[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [newRule, setNewRule] = useState({ brandId: '', size: '', price: '' });

  // Situation State
  const [situationHistory, setSituationHistory] = useState<SituationItem[]>([]);
  const [situationSummary, setSituationSummary] = useState<SituationSummary | null>(null);
  const [situationFilters, setSituationFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    endDate: new Date().toISOString().split('T')[0] // Today
  });

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    fetchData();
  }, [customerId]);

  useEffect(() => {
    if (activeTab === 'situation' && customerId) {
      fetchSituation();
    }
  }, [activeTab, situationFilters.startDate, situationFilters.endDate]);

  const fetchData = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const [custRes, priceRes, ruleRes, brandRes, sizeRes] = await Promise.all([
        api.getCustomer(customerId),
        api.getCustomerPrices(customerId),
        api.getCustomerRules(customerId),
        api.getBrands(),
        api.getProductSizes()
      ]);

      if (custRes.success) setCustomer(custRes.data as Customer);
      else throw new Error(custRes.message || 'Client non trouvé');

      if (priceRes.success) setPrices((priceRes.data as CustomerPrice[]) || []);
      if (ruleRes.success) setRules((ruleRes.data as Rule[]) || []);
      if (brandRes.success) setBrands((brandRes.data as Brand[]) || []);
      if (sizeRes.success) setSizes((sizeRes.data as string[]) || []);

    } catch (error: any) {
      console.error('Error fetching data:', error);
      setApiError(error.message || 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSituation = async () => {
    try {
      const response = await api.getCustomerSituation(customerId, {
        startDate: situationFilters.startDate,
        endDate: situationFilters.endDate
      });
      if (response.success && response.data) {
        setSituationHistory(response.data.history);
        setSituationSummary(response.data.summary);
      }
    } catch (error) {
      console.error("Error fetching situation:", error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await api.exportCustomerPrices(customerId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prix_client_${customerId}_${customer?.customercode || 'export'}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(`Erreur export: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return alert('Sélectionnez un fichier CSV.');
    setIsImporting(true);
    try {
      const response = await api.importCustomerPrices(customerId, importFile);
      if (response.success) {
        alert(`Import terminé: ${response.data.successful} succès, ${response.data.failed} échecs.`);
        fetchData();
        setImportFile(null);
        const fileInput = document.getElementById('importFile') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        alert(response.message);
      }
    } catch (error: any) {
      alert(`Erreur import: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeletePrice = async (productId: number) => {
    if (!confirm("Supprimer ce prix spécifique ?")) return;
    try {
      await api.deleteCustomerPrice(customerId, productId);
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.brandId || !newRule.size || !newRule.price) return alert("Remplissez tous les champs");
    try {
      await api.setCustomerRule(customerId, {
        brandId: Number(newRule.brandId),
        size: newRule.size,
        price: Number(newRule.price)
      });
      fetchData(); // Refresh all data
      setNewRule({ brandId: '', size: '', price: '' });
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (!confirm("Supprimer cette règle ?")) return;
    try {
      await api.deleteCustomerRule(customerId, ruleId);
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleFixMetadata = async () => {
    if (!confirm('Lancer la détection automatique des dimensions ?')) return;
    try {
      const response = await api.fixProductMetadata();
      if (response.success) {
        alert(response.message);
        fetchData(); // Refresh sizes
      } else {
        alert('Erreur lors de la détection.');
      }
    } catch (e: any) {
      alert('Erreur technique: ' + e.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading && !customer) return <p className="p-8 text-center text-slate-500">Chargement...</p>;
  if (!customer && !isLoading) return (
    <div className="p-8 text-center">
      <p className="text-red-500 mb-4">{apiError || 'Client non trouvé.'}</p>
      <Link href="/customers" className="text-blue-600 hover:underline">Retour à la liste</Link>
    </div>
  );

  return (
    <div className="p-2 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800 printable-page">
      <style jsx global>{`
        @media print {
          html, body {
            overflow: visible !important;
            height: auto !important;
          }
          body * {
            visibility: hidden;
          }
          .printable-page, .printable-page * {
            visibility: visible;
          }
          .printable-page {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          /* Ensure tables don't get cut off if they are wide */
          table {
            width: 100%;
            table-layout: auto;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 no-print">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">{customer?.customername}</h1>
            <p className="text-slate-500 text-sm sm:text-base">{customer?.customercode} - {customer?.customertype} (Liste: {customer?.pricelistname || 'N/A'})</p>
          </div>
          <Link href="/customers" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors self-start sm:self-auto">
            ← Retour Liste
          </Link>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 no-print overflow-x-auto">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('pricing')}
              className={`${activeTab === 'pricing' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Tarification (Règles & Exceptions)
            </button>
            <button
              onClick={() => setActiveTab('situation')}
              className={`${activeTab === 'situation' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Situation (Solde & Historique)
            </button>
          </nav>
        </div>

        {/* --- TAB: PRICING --- */}
        {activeTab === 'pricing' && (
          <div className="space-y-8">
            {/* Rules Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800">Règles de Prix (Par Lot)</h2>
                <button
                  onClick={handleFixMetadata}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded transition border border-slate-300"
                  title="Détecter automatiquement les dimensions depuis les noms de produits"
                >
                  Auto-détecter Dimensions
                </button>
              </div>

              {/* Add Rule Form */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 items-end bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Marque</label>
                  <select
                    className="w-full p-2 border rounded text-sm"
                    value={newRule.brandId}
                    onChange={e => setNewRule({ ...newRule, brandId: e.target.value })}
                  >
                    <option value="">-- Choisir Marque --</option>
                    {brands.map(b => <option key={b.brandid} value={b.brandid}>{b.brandname}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Dimension</label>
                  <select
                    className="w-full p-2 border rounded text-sm"
                    value={newRule.size}
                    onChange={e => setNewRule({ ...newRule, size: e.target.value })}
                  >
                    <option value="">-- Choisir Taille --</option>
                    {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Prix (DA)</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded text-sm"
                    placeholder="0.00"
                    value={newRule.price}
                    onChange={e => setNewRule({ ...newRule, price: e.target.value })}
                  />
                </div>
                <button
                  onClick={handleAddRule}
                  className="bg-purple-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-purple-700 transition w-full"
                >
                  Ajouter Règle
                </button>
              </div>

              {/* Rules Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse min-w-[500px]">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 border-b">Marque</th>
                      <th className="px-4 py-3 border-b">Dimension</th>
                      <th className="px-4 py-3 border-b text-right">Prix Appliqué</th>
                      <th className="px-4 py-3 border-b text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-4 text-slate-400">Aucune règle définie.</td></tr>
                    ) : (
                      rules.map((rule, index) => (
                        <tr key={`rule-${rule.ruleid}-${index}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 border-b font-medium">{rule.brandname}</td>
                          <td className="px-4 py-3 border-b font-mono">{rule.size}</td>
                          <td className="px-4 py-3 border-b text-right font-bold text-purple-600">
                            {formatCurrencyDZD(Number(rule.specificprice || rule.price))}
                          </td>
                          <td className="px-4 py-3 border-b text-center">
                            <button onClick={() => handleDeleteRule(rule.ruleid)} className="text-red-500 hover:underline text-xs">Supprimer</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Specific Prices Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b pb-2 gap-4">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800">Prix Spécifiques (Exceptions)</h2>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={handleExport} disabled={isExporting} className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200 whitespace-nowrap">
                    {isExporting ? '...' : 'Exporter CSV'}
                  </button>
                  <div className="flex items-center gap-1 flex-1 sm:flex-none">
                    <input
                      type="file"
                      id="importFile"
                      accept=".csv"
                      onChange={e => setImportFile(e.target.files?.[0] || null)}
                      className="text-xs w-full sm:w-40"
                    />
                    <button onClick={handleImport} disabled={isImporting || !importFile} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 whitespace-nowrap">
                      {isImporting ? '...' : 'Importer'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse min-w-[600px]">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 border-b">Produit</th>
                      <th className="px-4 py-3 border-b text-right">Prix Spécial</th>
                      <th className="px-4 py-3 border-b text-right">Prix Base</th>
                      <th className="px-4 py-3 border-b text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-4 text-slate-400">Aucun prix spécifique.</td></tr>
                    ) : (
                      prices.map((price, index) => (
                        <tr key={`price-${price.productid}-${index}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 border-b">
                            <div className="font-medium">{price.productname}</div>
                            <div className="text-xs text-slate-500">{price.productcode}</div>
                          </td>
                          <td className="px-4 py-3 border-b text-right font-bold text-green-600">{formatCurrencyDZD(Number(price.specificprice))}</td>
                          <td className="px-4 py-3 border-b text-right text-slate-400 line-through">{formatCurrencyDZD(Number(price.baseprice))}</td>
                          <td className="px-4 py-3 border-b text-center">
                            <button onClick={() => handleDeletePrice(price.productid)} className="text-red-500 hover:underline text-xs">Supprimer</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Aide */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
              <h3 className="font-bold mb-2">💡 Cascade des Prix</h3>
              <ol className="list-decimal list-inside space-y-1">
                <li><strong>Contrat (Prix Spécifique):</strong> Priorité absolue.</li>
                <li><strong>Règle (Marque/Taille):</strong> Si aucun contrat, vérifie les règles par lot.</li>
                <li><strong>Liste de Prix:</strong> Si aucune règle, utilise la liste assignée ({customer?.pricelistname || 'Aucune'}).</li>
                <li><strong>Prix de Base:</strong> Défaut si rien d'autre ne s'applique.</li>
              </ol>
            </div>
          </div>
        )}

        {/* --- TAB: SITUATION --- */}
        {activeTab === 'situation' && (
          <div className="space-y-6">
            {/* Filters & Actions */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500">Du</label>
                  <input
                    type="date"
                    className="border rounded p-1 text-sm"
                    value={situationFilters.startDate}
                    onChange={e => setSituationFilters({ ...situationFilters, startDate: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500">Au</label>
                  <input
                    type="date"
                    className="border rounded p-1 text-sm"
                    value={situationFilters.endDate}
                    onChange={e => setSituationFilters({ ...situationFilters, endDate: e.target.value })}
                  />
                </div>
                <button onClick={fetchSituation} className="text-slate-500 hover:text-slate-700">
                  🔄
                </button>
              </div>

              <button
                onClick={handlePrint}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-bold shadow-sm w-full md:w-auto justify-center"
              >
                <span>Imprimer</span>
                <span>🖨️</span>
              </button>
            </div>

            {/* --- Print Header (Only Visible on Print) --- */}
            <div className="hidden print:block mb-8">
              <div className="text-center border-b pb-4 mb-4">
                <h1 className="text-2xl font-bold uppercase mb-1">Relevé de Compte Client</h1>
                <h2 className="text-xl font-medium">{customer?.customername}</h2>
                <p className="text-sm text-gray-500">Période du {formatDate(situationFilters.startDate)} au {formatDate(situationFilters.endDate)}</p>
              </div>
            </div>


            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
                <p className="text-slate-500 text-xs uppercase font-bold mb-1">Solde Précédent / Actuel</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-800">{formatCurrencyDZD(situationSummary?.globalBalance || customer?.currentbalance || 0)}</p>
              </div>

              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
                <p className="text-slate-500 text-xs uppercase font-bold mb-1">Total Versements (Période)</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600">{formatCurrencyDZD(situationSummary?.totalCredit || 0)}</p>
              </div>

              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
                <p className="text-slate-500 text-xs uppercase font-bold mb-1">Total Achats (Période)</p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600">{formatCurrencyDZD(situationSummary?.totalDebit || 0)}</p>
                <p className="text-xs text-slate-400 mt-1">Reste Période: {formatCurrencyDZD(situationSummary?.periodBalance || 0)}</p>
              </div>
            </div>

            {/* Situation Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 border-b">Date</th>
                    <th className="px-4 py-3 border-b">Type</th>
                    <th className="px-4 py-3 border-b">N° Bon / Réf</th>
                    <th className="px-4 py-3 border-b text-right">Montant (Débit)</th>
                    <th className="px-4 py-3 border-b text-right">Versement (Crédit)</th>
                    <th className="px-4 py-3 border-b">Mode Paiement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {situationHistory.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Aucune opération sur cette période.</td></tr>
                  ) : (
                    situationHistory.map((item) => (
                      <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-600">{formatDate(item.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.type === 'VENTE' ? 'bg-blue-100 text-blue-700' :
                            item.type.includes('VERSEMENT') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{item.reference}</td>
                        <td className="px-4 py-3 text-right">
                          {item.debit > 0 ? (
                            <span className="font-bold text-slate-700">{formatCurrencyDZD(Number(item.debit))}</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.credit > 0 ? (
                            <span className="font-bold text-green-600">{formatCurrencyDZD(Number(item.credit))}</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {item.paymentmethod || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 font-bold text-slate-700">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right uppercase text-xs">Totaux Période</td>
                    <td className="px-4 py-3 text-right text-blue-700">{formatCurrencyDZD(situationSummary?.totalDebit || 0)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatCurrencyDZD(situationSummary?.totalCredit || 0)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
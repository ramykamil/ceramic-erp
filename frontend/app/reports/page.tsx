'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { DateQuickFilter, DateRange, getDateRange } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';

// Format helpers
const formatDZD = (n: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' DA';
const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '-';

// Tabs
const TABS = [
    { key: 'vente', label: 'Vente', icon: '🛒' },
    { key: 'benefices', label: 'Bénéfices', icon: '📊' },
    { key: 'marques', label: 'Marques', icon: '🏷️' },
    { key: 'produits', label: 'Produits', icon: '📦' },
    { key: 'clients', label: 'Clients', icon: '👥' },
];

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState('vente');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    // Data states
    const [salesData, setSalesData] = useState<any>(null);
    const [financialsData, setFinancialsData] = useState<any>(null);
    const [topProductsData, setTopProductsData] = useState<any[]>([]);
    const [topBrandsData, setTopBrandsData] = useState<any[]>([]);
    const [clientsData, setClientsData] = useState<any[]>([]);

    const loadData = async () => {
        setIsLoading(true);
        const params: any = { startDate, endDate };
        if (selectedUserId) params.salesPersonId = selectedUserId;

        try {
            const [sales, financials, products, brands, clients] = await Promise.all([
                api.getSalesReport(params),
                api.getFinancialsReport(params),
                api.getTopProductsReport(params),
                api.getTopBrandsReport(params),
                api.getClientsReport(params),
            ]);
            if (sales.success) setSalesData(sales.data);
            if (financials.success) setFinancialsData(financials.data);
            if (products.success) setTopProductsData(products.data || []);
            if (brands.success) setTopBrandsData(brands.data || []);
            if (clients.success) setClientsData(clients.data || []);
        } catch (error) {
            console.error('Error loading reports:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [startDate, endDate, activeTab, selectedUserId]);
    const handleRefresh = () => loadData();

    const handleDateFilterChange = (range: DateRange) => {
        setStartDate(range.startDate || '');
        setEndDate(range.endDate || '');
    };

    const kpis = salesData?.kpis;

    return (
        <div className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6 text-slate-800">
            <div className="max-w-[1920px] mx-auto">

                {/* === HEADER BAR === */}
                <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-slate-800">📊 Statistiques & Rapports</h1>
                        <p className="text-slate-500 text-xs mt-0.5">Analyse des ventes et performances</p>
                    </div>
                    <Link href="/" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-1.5">
                        ← Retour
                    </Link>
                </div>

                {/* === DATE QUICK FILTER === */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-4">
                    <div className="p-3 flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs text-slate-500 mb-2 font-medium">📅 Période:</p>
                            <DateQuickFilter
                                onFilterChange={handleDateFilterChange}
                                defaultPreset="THIS_MONTH"
                                showCustom={false}
                            />
                        </div>
                        <UserFilter
                            onUserChange={(userId) => setSelectedUserId(userId)}
                            label="Vendeur"
                        />
                    </div>
                    <div className="px-3 pb-3 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 text-sm">
                            <label className="text-slate-500 font-medium">Du</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <label className="text-slate-500 font-medium">Au</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
                        </div>
                        <button onClick={handleRefresh} disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 shadow-sm">
                            {isLoading ? '⏳ Chargement...' : '🔄 Actualiser'}
                        </button>
                    </div>
                </div>

                {/* === KPI CARDS === */}
                {kpis && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        <div className="bg-blue-600 text-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs font-medium opacity-80 uppercase">Total Hier</div>
                            <div className="text-xl md:text-2xl font-bold mt-1">{formatDZD(kpis.totalHier)}</div>
                        </div>
                        <div className="bg-blue-700 text-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs font-medium opacity-80 uppercase">Total Période</div>
                            <div className="text-xl md:text-2xl font-bold mt-1">{formatDZD(kpis.total)}</div>
                        </div>
                        <div className="bg-green-600 text-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs font-medium opacity-80 uppercase">Versements</div>
                            <div className="text-xl md:text-2xl font-bold mt-1">{formatDZD(kpis.versement)}</div>
                        </div>
                        <div className="bg-red-600 text-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs font-medium opacity-80 uppercase">Reste</div>
                            <div className="text-xl md:text-2xl font-bold mt-1">{formatDZD(kpis.reste)}</div>
                        </div>
                        <div className="bg-white border border-slate-200 text-slate-800 rounded-lg p-4 shadow-sm">
                            <div className="text-xs font-medium text-slate-500 uppercase">Nb Ventes</div>
                            <div className="text-xl md:text-2xl font-bold mt-1">{kpis.count}</div>
                        </div>
                    </div>
                )}

                {/* === TABS === */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex border-b border-slate-200 bg-slate-50">
                        {TABS.map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key
                                    ? 'border-blue-600 text-blue-600 bg-white'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                                    }`}>
                                <span>{tab.icon}</span> {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* TAB CONTENT */}
                    <div className="p-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-32 text-slate-400">
                                <div className="text-center">
                                    <div className="inline-block w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-2"></div>
                                    <p className="text-sm">Chargement...</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* VENTE TAB */}
                                {activeTab === 'vente' && salesData && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-100 text-slate-600">
                                                <tr>
                                                    <th className="p-2 text-left font-medium">N°</th>
                                                    <th className="p-2 text-left font-medium">Client</th>
                                                    <th className="p-2 text-left font-medium">Date</th>
                                                    <th className="p-2 text-left font-medium">Heure</th>
                                                    <th className="p-2 text-right font-medium">Total</th>
                                                    <th className="p-2 text-right font-medium">Reste</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {salesData.transactions?.length === 0 ? (
                                                    <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucune vente pour cette période</td></tr>
                                                ) : salesData.transactions?.map((t: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50">
                                                        <td className="p-2 font-mono text-blue-600">{t.numero}</td>
                                                        <td className="p-2 font-medium">{t.client || 'Client Comptoir'}</td>
                                                        <td className="p-2 text-slate-600">{formatDate(t.date)}</td>
                                                        <td className="p-2 text-slate-500">{t.heure || '-'}</td>
                                                        <td className="p-2 text-right font-mono font-bold">{formatDZD(t.total)}</td>
                                                        <td className={`p-2 text-right font-mono font-bold ${parseFloat(t.reste) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {formatDZD(t.reste)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* BENEFICES TAB */}
                                {activeTab === 'benefices' && financialsData && (
                                    <div className="space-y-4">
                                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg p-6 text-center shadow-lg">
                                            <div className="text-sm font-medium opacity-90 uppercase mb-1">💰 Chiffre d'Affaires</div>
                                            <div className="text-3xl md:text-4xl font-bold">{formatDZD(financialsData.chiffreAffaires)}</div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <div className="bg-teal-600 text-white rounded-lg p-4 shadow-sm">
                                                <div className="text-xs font-medium opacity-80">📈 Bénéfice Net</div>
                                                <div className="text-2xl font-bold mt-2">{formatDZD(financialsData.beneficeNet)}</div>
                                            </div>
                                            <div className="bg-cyan-600 text-white rounded-lg p-4 shadow-sm">
                                                <div className="text-xs font-medium opacity-80">👥 Crédit Clients</div>
                                                <div className="text-2xl font-bold mt-2">{formatDZD(financialsData.creditClient)}</div>
                                            </div>
                                            <div className="bg-purple-700 text-white rounded-lg p-4 shadow-sm">
                                                <div className="text-xs font-medium opacity-80">🏭 Crédit Fournisseurs</div>
                                                <div className="text-2xl font-bold mt-2">{formatDZD(financialsData.creditFournisseurs)}</div>
                                            </div>
                                            <div className="bg-green-600 text-white rounded-lg p-4 shadow-sm">
                                                <div className="text-xs font-medium opacity-80">💸 Charges</div>
                                                <div className="text-2xl font-bold mt-2">{formatDZD(financialsData.charges)}</div>
                                            </div>
                                            <div className="bg-slate-800 text-white rounded-lg p-4 shadow-sm col-span-1 md:col-span-2">
                                                <div className="text-xs font-medium opacity-80">💵 Capital</div>
                                                <div className="text-2xl font-bold mt-2">{formatDZD(financialsData.capital)}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* MARQUES TAB */}
                                {activeTab === 'marques' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-100 text-slate-600">
                                                <tr>
                                                    <th className="p-2 text-left font-medium">Marque</th>
                                                    <th className="p-2 text-right font-medium">Nb Produits</th>
                                                    <th className="p-2 text-right font-medium">Qté Vendue</th>
                                                    <th className="p-2 text-right font-medium">Nb Ventes</th>
                                                    <th className="p-2 text-right font-medium">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {topBrandsData.length === 0 ? (
                                                    <tr><td colSpan={5} className="p-4 text-center text-slate-400">Aucune marque vendue pour cette période</td></tr>
                                                ) : topBrandsData.map((b, i) => (
                                                    <tr key={i} className="hover:bg-slate-50">
                                                        <td className="p-2 font-bold text-blue-600">{b.brand}</td>
                                                        <td className="p-2 text-right font-mono text-slate-500">{b.nb_produits}</td>
                                                        <td className="p-2 text-right font-mono">{Math.round(b.qty_total)}</td>
                                                        <td className="p-2 text-right font-mono text-slate-600">{b.vente_count}x</td>
                                                        <td className="p-2 text-right font-mono font-bold text-green-600">{formatDZD(b.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* PRODUITS TAB */}
                                {activeTab === 'produits' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-100 text-slate-600">
                                                <tr>
                                                    <th className="p-2 text-left font-medium">Référence</th>
                                                    <th className="p-2 text-left font-medium">Désignation</th>
                                                    <th className="p-2 text-left font-medium">Marque</th>
                                                    <th className="p-2 text-right font-medium">Qté Vendue</th>
                                                    <th className="p-2 text-right font-medium">Nb Ventes</th>
                                                    <th className="p-2 text-right font-medium">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {topProductsData.length === 0 ? (
                                                    <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun produit vendu pour cette période</td></tr>
                                                ) : topProductsData.map((p, i) => (
                                                    <tr key={i} className="hover:bg-slate-50">
                                                        <td className="p-2 font-mono text-blue-600">{p.reference}</td>
                                                        <td className="p-2 font-medium">{p.designation}</td>
                                                        <td className="p-2">
                                                            <span className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">{p.brand || 'N/A'}</span>
                                                        </td>
                                                        <td className="p-2 text-right font-mono">{Math.round(p.qty_total)}</td>
                                                        <td className="p-2 text-right font-mono text-slate-600">{p.vente_count}x</td>
                                                        <td className="p-2 text-right font-mono font-bold text-green-600">{formatDZD(p.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* CLIENTS TAB */}
                                {activeTab === 'clients' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-100 text-slate-600">
                                                <tr>
                                                    <th className="p-2 text-left font-medium">Client</th>
                                                    <th className="p-2 text-left font-medium">Type</th>
                                                    <th className="p-2 text-right font-medium">Commandes</th>
                                                    <th className="p-2 text-right font-medium">Total Achats</th>
                                                    <th className="p-2 text-right font-medium">Versements</th>
                                                    <th className="p-2 text-right font-medium">Reste</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {clientsData.length === 0 ? (
                                                    <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun client actif pour cette période</td></tr>
                                                ) : clientsData.map((c, i) => (
                                                    <tr key={i} className="hover:bg-slate-50">
                                                        <td className="p-2 font-medium">{c.nom}</td>
                                                        <td className="p-2">
                                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.type === 'WHOLESALE' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                                                }`}>
                                                                {c.type === 'WHOLESALE' ? 'Gros' : 'Détail'}
                                                            </span>
                                                        </td>
                                                        <td className="p-2 text-right font-mono">{c.nb_commandes}</td>
                                                        <td className="p-2 text-right font-mono font-bold">{formatDZD(c.total)}</td>
                                                        <td className="p-2 text-right font-mono text-green-600">{formatDZD(c.versement)}</td>
                                                        <td className={`p-2 text-right font-mono font-bold ${parseFloat(c.reste) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {formatDZD(c.reste)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

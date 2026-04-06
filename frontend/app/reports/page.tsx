'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { useSortableTable } from '@/hooks/useSortableTable';
import Link from 'next/link';
import { DateQuickFilter, DateRange, getDateRange } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';
import { ClientStatsModal } from '@/components/ClientStatsModal';
import { useTableNavigation } from '@/hooks/useTableNavigation';

// Format helpers
const formatDZD = (n: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' DA';

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
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-focus the container on mount
    useEffect(() => {
        containerRef.current?.focus();
    }, []);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [selectedClient, setSelectedClient] = useState<any>(null);

    // Data states
    const [salesData, setSalesData] = useState<any>(null);
    const [financialsData, setFinancialsData] = useState<any>(null);
    const [topProductsData, setTopProductsData] = useState<any[]>([]);
    const [topBrandsData, setTopBrandsData] = useState<any[]>([]);
    const [clientsData, setClientsData] = useState<any[]>([]);

    // Keyboard navigation
    const { selectedIndex, handleKeyDown, getRowClass, getRowProps } = useTableNavigation({
        rowCount: salesData?.transactions?.length || 0,
        onAction: (idx) => {
            const t = salesData.transactions[idx];
            console.log('Action on report transaction:', t);
        }
    });

    // Sorting Hooks
    const { sortedData: sortedSales, handleSort: handleSortSales, sortConfig: sortConfigSales } = useSortableTable(salesData?.transactions || []);
    const { sortedData: sortedProducts, handleSort: handleSortProducts, sortConfig: sortConfigProducts } = useSortableTable(topProductsData);
    const { sortedData: sortedBrands, handleSort: handleSortBrands, sortConfig: sortConfigBrands } = useSortableTable(topBrandsData);
    const { sortedData: sortedClients, handleSort: handleSortClients, sortConfig: sortConfigClients } = useSortableTable(clientsData);

    const getSortIcon = (config: any, key: string) => {
        if (config.key !== key) return <span className="opacity-30 ml-1 text-[10px]">↕</span>;
        return config.direction === 'asc' ? <span className="ml-1 text-blue-600">▲</span> : <span className="ml-1 text-blue-600">▼</span>;
    };

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
        <div 
            ref={containerRef}
            className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6 text-slate-800 outline-none"
        >
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
                            className="bg-brand-primary hover:bg-brand-primary-dark text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 shadow-sm transition-colors">
                            {isLoading ? '⏳ Chargement...' : '🔄 Actualiser'}
                        </button>
                    </div>
                </div>

                {/* === KPI CARDS === */}
                {kpis && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        <div className="bg-slate-800 text-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs font-medium opacity-80 uppercase">Total Hier</div>
                            <div className="text-xl md:text-2xl font-bold mt-1">{formatDZD(kpis.totalHier)}</div>
                        </div>
                        <div className="bg-brand-primary text-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs font-medium opacity-80 uppercase">Total Période</div>
                            <div className="text-xl md:text-2xl font-bold mt-1">{formatDZD(kpis.total)}</div>
                        </div>
                        <div className="bg-emerald-600 text-white rounded-lg p-4 shadow-sm">
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
                                    ? 'border-brand-primary text-brand-primary bg-white'
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
                                    <div className="inline-block w-6 h-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin mb-2"></div>
                                    <p className="text-sm">Chargement...</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* VENTE TAB */}
                                {activeTab === 'vente' && salesData && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                                                <tr>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortSales('numero')}>N° {getSortIcon(sortConfigSales, 'numero')}</th>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortSales('client')}>Client {getSortIcon(sortConfigSales, 'client')}</th>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortSales('date')}>Date {getSortIcon(sortConfigSales, 'date')}</th>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortSales('heure')}>Heure {getSortIcon(sortConfigSales, 'heure')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortSales('total')}>Total {getSortIcon(sortConfigSales, 'total')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortSales('reste')}>Reste {getSortIcon(sortConfigSales, 'reste')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sortedSales.length === 0 ? (
                                                    <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucune vente pour cette période</td></tr>
                                                ) : sortedSales.map((t: any, i: number) => (
                                                    <tr key={i} {...getRowProps(i)} className={getRowClass(i, "hover:bg-slate-50 transition cursor-pointer")}>
                                                        <td className="p-2 font-mono text-brand-primary">{t.numero}</td>
                                                        <td className="p-2 font-medium">{t.client || 'Client Comptoir'}</td>
                                                        <td className="p-2 text-slate-600">{formatDate(t.date)}</td>
                                                        <td className="p-2 text-slate-500">{t.heure || '-'}</td>
                                                        <td className="p-2 text-right font-mono font-bold">{formatDZD(t.total)}</td>
                                                        <td className={`p-2 text-right font-mono font-bold ${parseFloat(t.reste) > 0 ? 'text-brand-primary' : 'text-emerald-600'}`}>
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
                                            <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                                                <tr>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortBrands('brand')}>Marque {getSortIcon(sortConfigBrands, 'brand')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortBrands('nb_produits')}>Nb Produits {getSortIcon(sortConfigBrands, 'nb_produits')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortBrands('qty_total')}>Qté Vendue {getSortIcon(sortConfigBrands, 'qty_total')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortBrands('vente_count')}>Nb Ventes {getSortIcon(sortConfigBrands, 'vente_count')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortBrands('total')}>Total {getSortIcon(sortConfigBrands, 'total')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sortedBrands.length === 0 ? (
                                                    <tr><td colSpan={5} className="p-4 text-center text-slate-400">Aucune marque vendue pour cette période</td></tr>
                                                ) : sortedBrands.map((b, i) => (
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
                                            <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                                                <tr>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortProducts('reference')}>Référence {getSortIcon(sortConfigProducts, 'reference')}</th>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortProducts('designation')}>Désignation {getSortIcon(sortConfigProducts, 'designation')}</th>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortProducts('brand')}>Marque {getSortIcon(sortConfigProducts, 'brand')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortProducts('qty_total')}>Qté Vendue {getSortIcon(sortConfigProducts, 'qty_total')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortProducts('vente_count')}>Nb Ventes {getSortIcon(sortConfigProducts, 'vente_count')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortProducts('total')}>Total {getSortIcon(sortConfigProducts, 'total')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sortedProducts.length === 0 ? (
                                                    <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun produit vendu pour cette période</td></tr>
                                                ) : sortedProducts.map((p, i) => (
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
                                            <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                                                <tr>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClients('nom')}>Client {getSortIcon(sortConfigClients, 'nom')}</th>
                                                    <th className="p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClients('type')}>Type {getSortIcon(sortConfigClients, 'type')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClients('nb_commandes')}>Commandes {getSortIcon(sortConfigClients, 'nb_commandes')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClients('total')}>Total Achats {getSortIcon(sortConfigClients, 'total')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClients('versement')}>Versements {getSortIcon(sortConfigClients, 'versement')}</th>
                                                    <th className="p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClients('reste')}>Reste {getSortIcon(sortConfigClients, 'reste')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sortedClients.length === 0 ? (
                                                    <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun client actif pour cette période</td></tr>
                                                ) : sortedClients.map((c, i) => (
                                                    <tr key={i} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => setSelectedClient(c)}>
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
            
            {/* Client Details Modal */}
            {selectedClient && (
                <ClientStatsModal 
                    client={selectedClient} 
                    startDate={startDate} 
                    endDate={endDate} 
                    onClose={() => setSelectedClient(null)} 
                />
            )}
        </div>
    );
}

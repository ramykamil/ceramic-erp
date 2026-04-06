import React, { useState, useEffect } from 'react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';

interface ClientStatsModalProps {
    client: any;
    startDate: string;
    endDate: string;
    onClose: () => void;
}

const formatDZD = (n: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' DA';
// Helper

export function ClientStatsModal({ client, startDate, endDate, onClose }: ClientStatsModalProps) {
    const [activeTab, setActiveTab] = useState<'achats' | 'versements'>('achats');
    const [isLoading, setIsLoading] = useState(true);
    
    // Data states
    const [salesData, setSalesData] = useState<any>(null);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [versements, setVersements] = useState<any[]>([]);

    useEffect(() => {
        if (!client) return;

        let isMounted = true;
        const loadData = async () => {
            setIsLoading(true);
            try {
                // Handle different potential casing from postgres/frontend
                const customerId = client.customerid || client.CustomerID || client.Customerid || client.id;
                
                if (!customerId) {
                    throw new Error("Client ID manquant");
                }
                
                // Fetch in parallel
                const [salesRes, productsRes, versementsRes] = await Promise.all([
                    api.getSalesReport({ startDate, endDate, customerId }),
                    api.getTopProductsReport({ startDate, endDate, customerId }),
                    api.getClientVersements({ startDate, endDate, customerId })
                ]);

                if (isMounted) {
                    if (salesRes.success) setSalesData(salesRes.data);
                    if (productsRes.success) setTopProducts(productsRes.data || []);
                    if (versementsRes.success) setVersements(versementsRes.data || []);
                }
            } catch (error: any) {
                console.error("Failed to load client details", error);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, [client, startDate, endDate]);

    if (!client) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span>👤</span> {client.nom || client.customername}
                        </h2>
                        <div className="flex gap-4 mt-1 text-xs text-slate-500 font-medium">
                            <span>Période: {formatDate(startDate)} - {formatDate(endDate)}</span>
                            {client.type && (
                                <span className={client.type === 'WHOLESALE' ? 'text-blue-600' : 'text-green-600'}>
                                    Type: {client.type === 'WHOLESALE' ? 'Gros' : 'Détail'}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    {/* KPI Summary (Mirrors the main table row) */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                            <div className="text-sm font-medium text-slate-500 mb-1">Total Achats</div>
                            <div className="text-xl font-bold text-slate-800">{formatDZD(client.total || salesData?.kpis?.total || 0)}</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                            <div className="text-sm font-medium text-slate-500 mb-1">Versements Période</div>
                            <div className="text-xl font-bold text-green-600">{formatDZD(client.versement || salesData?.kpis?.versement || 0)}</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                            <div className="text-sm font-medium text-slate-500 mb-1">Reste Période / Global</div>
                            <div className="text-xl font-bold text-red-600">
                                {formatDZD(client.reste || salesData?.kpis?.reste || 0)}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 border-b border-slate-200 mb-4 px-2">
                        <button
                            onClick={() => setActiveTab('achats')}
                            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'achats' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            🛒 Commandes & Achats
                        </button>
                        <button
                            onClick={() => setActiveTab('versements')}
                            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'versements' ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            💸 Historique Versements
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center p-12 text-slate-400">
                            <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full"></div>
                        </div>
                    ) : (
                        <div>
                            {activeTab === 'achats' && (
                                <div className="space-y-6">
                                    {/* Top Products */}
                                    {topProducts.length > 0 && (
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-700 border-b border-slate-200">
                                                Produits les plus achetés
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="text-slate-500 bg-slate-50">
                                                        <tr>
                                                            <th className="p-2 pl-4 text-left font-medium">Référence</th>
                                                            <th className="p-2 text-left font-medium">Désignation</th>
                                                            <th className="p-2 text-right font-medium">Qté Achetée</th>
                                                            <th className="p-2 pr-4 text-right font-medium">Total (DA)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {topProducts.slice(0, 5).map((p, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50 text-slate-700">
                                                                <td className="p-2 pl-4 font-mono text-blue-600 text-xs">{p.reference}</td>
                                                                <td className="p-2 font-medium">{p.designation}</td>
                                                                <td className="p-2 text-right font-mono font-medium">{Math.round(p.qty_total)}</td>
                                                                <td className="p-2 pr-4 text-right font-mono font-semibold">{formatDZD(p.total)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Recent Orders */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-700 border-b border-slate-200">
                                            Historique des commandes
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="text-slate-500 bg-slate-50">
                                                    <tr>
                                                        <th className="p-2 pl-4 text-left font-medium">N° Bon</th>
                                                        <th className="p-2 text-left font-medium">Date</th>
                                                        <th className="p-2 text-left font-medium">Heure</th>
                                                        <th className="p-2 text-right font-medium">Montant Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {!salesData?.transactions || salesData.transactions.length === 0 ? (
                                                        <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucune commande trouvée</td></tr>
                                                    ) : salesData.transactions.map((t: any, idx: number) => (
                                                        <tr key={idx} className="hover:bg-slate-50 text-slate-700">
                                                            <td className="p-2 pl-4 font-mono font-medium">{t.numero}</td>
                                                            <td className="p-2">{formatDate(t.date)}</td>
                                                            <td className="p-2 text-slate-500">{t.heure || '-'}</td>
                                                            <td className="p-2 text-right font-mono font-bold">{formatDZD(t.total)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'versements' && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-green-50 px-4 py-2 font-semibold text-green-800 border-b border-green-100">
                                        Liste des Versements
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-slate-500 bg-slate-50">
                                                <tr>
                                                    <th className="p-2 pl-4 text-left font-medium">Date & Heure</th>
                                                    <th className="p-2 text-left font-medium">Caisse</th>
                                                    <th className="p-2 text-left font-medium">Note/Motif</th>
                                                    <th className="p-2 pr-4 text-right font-medium">Montant</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {versements.length === 0 ? (
                                                    <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucun versement trouvé pour cette période</td></tr>
                                                ) : versements.map((v: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-green-50/50 text-slate-700">
                                                        <td className="p-2 pl-4">
                                                            <div>{formatDate(v.createdat)}</div>
                                                            <div className="text-[10px] text-slate-400">
                                                                {new Date(v.createdat).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </td>
                                                        <td className="p-2 font-medium">{v.accountname}</td>
                                                        <td className="p-2 text-xs italic text-slate-500">{v.motif || v.observation || '-'}</td>
                                                        <td className="p-2 pr-4 text-right font-mono font-bold text-green-600">{formatDZD(v.amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

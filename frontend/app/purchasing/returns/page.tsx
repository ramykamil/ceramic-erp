'use client';

import { useState, useEffect } from 'react';
import { formatDate, cn } from '@/lib/utils';
import api from '@/lib/api';
import Link from 'next/link';
import { DateQuickFilter, DateRange, getDateRange } from '@/components/DateQuickFilter';

// --- Interfaces ---
interface PurchaseReturn {
    returnid: number;
    returnnumber: string;
    purchaseorderid: number | null;
    ponumber: string | null;
    factoryid: number | null;
    factoryname: string | null;
    returndate: string;
    status: 'PENDING' | 'APPROVED' | 'CANCELLED';
    totalamount: number;
    notes: string;
    createdbyname: string;
    itemcount: number;
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
        PENDING: 'bg-amber-500/10 text-amber-300',
        APPROVED: 'bg-emerald-500/10 text-emerald-300',
        CANCELLED: 'bg-sky-500/10 text-sky-300',
    };
    const labels: Record<string, string> = {
        PENDING: 'En attente',
        APPROVED: 'Approuvé',
        CANCELLED: 'Annulé',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badges[status] || 'bg-slate-800/50'}`}>
            {labels[status] || status}
        </span>
    );
};

export default function PurchaseReturnsPage() {
    const [returns, setReturns] = useState<PurchaseReturn[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<DateRange>(getDateRange('TODAY'));
    const [factories, setFactories] = useState<{ factoryid: number; factoryname: string }[]>([]);
    const [selectedFactoryId, setSelectedFactoryId] = useState<string>('');

    // Load data
    useEffect(() => {
        const loadInitData = async () => {
            try {
                const factoriesRes = await api.getFactories(); // Ensure this exists or use getFactories/getBrands logic
                if (factoriesRes.success) {
                    setFactories(factoriesRes.data as any[]);
                }
            } catch (e) {
                console.error("Failed to load factories", e);
            }
        };
        loadInitData();
    }, []);

    useEffect(() => {
        const fetchReturns = async () => {
            setLoading(true);
            try {
                const params: any = {};
                if (dateRange.startDate) params.startDate = dateRange.startDate;
                if (dateRange.endDate) params.endDate = dateRange.endDate;
                if (selectedFactoryId) params.factoryId = selectedFactoryId;

                const res = await api.getPurchaseReturns(params);
                if (res.success) {
                    setReturns(res.data as PurchaseReturn[]);
                } else {
                    setError(res.message || 'Failed to load returns');
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchReturns();
    }, [dateRange, selectedFactoryId]);

    const handleDelete = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce retour ?')) return;
        try {
            const res = await api.deletePurchaseReturn(id);
            if (res.success) {
                setReturns(returns.filter(r => r.returnid !== id));
            } else {
                alert('Erreur: ' + res.message);
            }
        } catch (err: any) {
            alert('Erreur: ' + err.message);
        }
    };

    const handleApprove = async (id: number) => {
        if (!confirm('Confirmer le retour ? Le stock sera DEBITÉ (sorti) du stock.')) return;
        try {
            const res = await api.updatePurchaseReturnStatus(id, 'APPROVED');
            if (res.success) {
                alert('Retour approuvé avec succès.');
                // Reload
                const updatedRes = await api.getPurchaseReturns({}); // simplistic reload
                if (updatedRes.success) setReturns(updatedRes.data as PurchaseReturn[]);
            } else {
                alert('Erreur: ' + res.message);
            }
        } catch (err: any) {
            alert('Erreur: ' + err.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900/40 p-6">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-100">Retours aux Fournisseurs</h1>
                        <p className="text-slate-500">Gérez les retours de marchandise vers les usines/marques.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/purchasing" className="bg-slate-900/60 border border-white/[0.08] hover:bg-slate-900/40 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            ← Achats
                        </Link>
                        <Link href="/purchasing/returns/new" className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm shadow-black/10 transition-colors flex items-center gap-2">
                            <span>＋</span> Nouveau Retour
                        </Link>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-slate-900/60 p-4 rounded-xl shadow-sm shadow-black/10 border border-white/[0.06] flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[300px]">
                        <label className="block text-sm font-medium text-slate-200 mb-1">Période</label>
                        <DateQuickFilter onFilterChange={setDateRange} defaultPreset="TODAY" />
                    </div>

                    <div className="w-64">
                        <label className="block text-sm font-medium text-slate-200 mb-1">Usine / Fournisseur</label>
                        <select
                            className="w-full border-white/[0.08] rounded-lg text-sm focus:ring-sky-500/30 focus:border-sky-500"
                            value={selectedFactoryId}
                            onChange={(e) => setSelectedFactoryId(e.target.value)}
                        >
                            <option value="">Tous les fournisseurs</option>
                            {factories.map(f => (
                                <option key={f.factoryid} value={f.factoryid}>{f.factoryname}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                        <p className="mt-2 text-slate-500">Chargement...</p>
                    </div>
                ) : error ? (
                    <div className="bg-sky-500/10 border border-sky-500/20 text-sky-300 p-4 rounded-lg">
                        {error}
                    </div>
                ) : (
                    <div className="bg-slate-900/60 rounded-xl shadow-sm shadow-black/10 border border-white/[0.06] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-900/40 text-slate-400 font-medium border-b border-white/[0.06]">
                                    <tr>
                                        <th className="px-6 py-4">N° Retour</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Fournisseur</th>
                                        <th className="px-6 py-4 text-center">Articles</th>
                                        <th className="px-6 py-4 text-right">Montant Total</th>
                                        <th className="px-6 py-4 text-center">Statut</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {returns.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                                Aucun retour trouvé.
                                            </td>
                                        </tr>
                                    ) : (
                                        returns.map((ret) => (
                                            <tr key={ret.returnid} className="hover:bg-slate-900/40 transition-colors">
                                                <td className="px-6 py-4 font-medium text-white">
                                                    <Link href={`/purchasing/returns/${ret.returnid}`} className="hover:text-sky-400 hover:underline">
                                                        {ret.returnnumber}
                                                    </Link>
                                                    {ret.ponumber && (
                                                        <div className="text-xs text-slate-400 mt-1">Ref PO: {ret.ponumber}</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-slate-400">{formatDate(ret.returndate)}</td>
                                                <td className="px-6 py-4 text-slate-200">{ret.factoryname || '-'}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800/50 text-slate-100">
                                                        {ret.itemcount}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-white">
                                                    {formatCurrency(ret.totalamount)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {getStatusBadge(ret.status)}
                                                </td>
                                                <td className="px-6 py-4 text-right space-x-2">
                                                    <Link
                                                        href={`/purchasing/returns/${ret.returnid}`}
                                                        className="text-sky-400 hover:text-blue-800 font-medium text-xs"
                                                    >
                                                        Voir
                                                    </Link>

                                                    {ret.status === 'PENDING' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleApprove(ret.returnid)}
                                                                className="text-emerald-400 hover:text-emerald-300 font-medium text-xs"
                                                            >
                                                                Approuver
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(ret.returnid)}
                                                                className="text-sky-400 hover:text-sky-300 font-medium text-xs"
                                                            >
                                                                Supprimer
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
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

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-DZ');
};

const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-800',
        APPROVED: 'bg-green-100 text-green-800',
        CANCELLED: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
        PENDING: 'En attente',
        APPROVED: 'Approuvé',
        CANCELLED: 'Annulé',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badges[status] || 'bg-gray-100'}`}>
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
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Retours aux Fournisseurs</h1>
                        <p className="text-slate-500">Gérez les retours de marchandise vers les usines/marques.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/purchasing" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            ← Achats
                        </Link>
                        <Link href="/purchasing/returns/new" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center gap-2">
                            <span>＋</span> Nouveau Retour
                        </Link>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[300px]">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Période</label>
                        <DateQuickFilter onFilterChange={setDateRange} defaultPreset="TODAY" />
                    </div>

                    <div className="w-64">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Usine / Fournisseur</label>
                        <select
                            className="w-full border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
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
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
                        {error}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
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
                                            <tr key={ret.returnid} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-slate-900">
                                                    <Link href={`/purchasing/returns/${ret.returnid}`} className="hover:text-blue-600 hover:underline">
                                                        {ret.returnnumber}
                                                    </Link>
                                                    {ret.ponumber && (
                                                        <div className="text-xs text-slate-400 mt-1">Ref PO: {ret.ponumber}</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-slate-600">{formatDate(ret.returndate)}</td>
                                                <td className="px-6 py-4 text-slate-700">{ret.factoryname || '-'}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                                        {ret.itemcount}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-900">
                                                    {formatCurrency(ret.totalamount)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {getStatusBadge(ret.status)}
                                                </td>
                                                <td className="px-6 py-4 text-right space-x-2">
                                                    <Link
                                                        href={`/purchasing/returns/${ret.returnid}`}
                                                        className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                                                    >
                                                        Voir
                                                    </Link>

                                                    {ret.status === 'PENDING' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleApprove(ret.returnid)}
                                                                className="text-green-600 hover:text-green-800 font-medium text-xs"
                                                            >
                                                                Approuver
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(ret.returnid)}
                                                                className="text-red-600 hover:text-red-800 font-medium text-xs"
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

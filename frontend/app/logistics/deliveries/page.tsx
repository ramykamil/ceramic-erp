'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// --- Interfaces ---
interface Delivery {
    deliveryid: number;
    deliverynumber?: string;
    ordernumber: string;
    customername?: string;
    driverfirstname?: string;
    driverlastname?: string;
    vehiclenumber?: string;
    vehicletype?: string;
    destination?: string;
    status: string;
    deliverydate: string;
}

// --- Helpers ---
const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    try {
        return new Date(dateString).toLocaleDateString('fr-DZ', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    } catch { return dateString; }
};

const getStatusBadge = (status: string) => {
    const classes = {
        SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
        PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
        IN_TRANSIT: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        CANCELLED: 'bg-red-50 text-red-700 border-red-200',
        FAILED: 'bg-red-50 text-red-700 border-red-200',
    };
    return classes[status as keyof typeof classes] || 'bg-slate-50 text-slate-700 border-slate-200';
};

const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
        SCHEDULED: 'Planifié',
        PENDING: 'En Attente',
        IN_TRANSIT: 'En Transit',
        DELIVERED: 'Livré',
        CANCELLED: 'Annulé',
        FAILED: 'Échec',
    };
    return labels[status] || status;
};

export default function LogisticsPage() {
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        setApiError(null);
        try {
            const response = await api.getDeliveries();
            if (response.success) {
                setDeliveries((response.data as Delivery[]) || []);
            } else {
                if (response.message?.includes('token')) router.push('/login');
                throw new Error(response.message || 'Erreur inconnue');
            }
        } catch (error: any) {
            console.error('Failed to load deliveries', error);
            setApiError(`Impossible de charger les livraisons: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (id: number, newStatus: string) => {
        try {
            const response = await api.updateDeliveryStatus(id, newStatus);
            if (response.success) {
                loadData(); // Reload data
            } else {
                throw new Error(response.message || 'Échec de la mise à jour');
            }
        } catch (error: any) {
            console.error('Failed to update status', error);
            alert(`Erreur: ${error.message}`);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-7xl mx-auto">

                {/* --- Header --- */}
                <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Livraisons</h1>
                        <p className="text-slate-500 text-sm mt-1">Suivi de la flotte et des expéditions</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/logistics/deliveries/new')}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2"
                        >
                            <span className="text-lg leading-none">+</span> Nouvelle Livraison
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
                {apiError && (
                    <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                        <strong>Erreur:</strong> {apiError}
                    </div>
                )}

                {/* --- Table --- */}
                <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                    {isLoading ? (
                        <div className="text-center py-20">
                            <div className="inline-block w-8 h-8 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500">Chargement des livraisons...</p>
                        </div>
                    ) : deliveries.length === 0 && !apiError ? (
                        <div className="text-center py-20 text-slate-400">
                            <p className="text-lg">Aucune livraison en cours.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4">N° Livraison</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Client / Commande</th>
                                        <th className="px-6 py-4">Chauffeur / Véhicule</th>
                                        <th className="px-6 py-4 text-center">Statut</th>
                                        <th className="px-6 py-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {deliveries.map((d) => (
                                        <tr key={d.deliveryid} className="hover:bg-slate-50 transition-colors duration-150">
                                            <td className="px-6 py-4 font-mono text-slate-600 font-medium">
                                                {d.deliverynumber || `#${d.deliveryid}`}
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">{formatDate(d.deliverydate)}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-900">{d.customername || '—'}</div>
                                                <div className="text-xs text-slate-400">{d.ordernumber}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-slate-700">
                                                    {d.driverfirstname ? `${d.driverfirstname} ${d.driverlastname || ''}` : 'Non assigné'}
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                    {d.vehiclenumber || '—'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(d.status)}`}>
                                                    {getStatusLabel(d.status)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <select
                                                    value={d.status}
                                                    onChange={(e) => handleStatusUpdate(d.deliveryid, e.target.value)}
                                                    className="text-xs border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition"
                                                >
                                                    <option value="SCHEDULED">Planifié</option>
                                                    <option value="PENDING">En Attente</option>
                                                    <option value="IN_TRANSIT">En Transit</option>
                                                    <option value="DELIVERED">Livré</option>
                                                    <option value="CANCELLED">Annulé</option>
                                                    <option value="FAILED">Échec</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

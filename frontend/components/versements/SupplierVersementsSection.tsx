'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { DateQuickFilter, DateRange, DateFilterPreset } from '@/components/DateQuickFilter';
import SupplierVersementModal from '@/components/versements/SupplierVersementModal';

interface SupplierVersement {
    transactionid: number;
    accountid: number;
    accountname: string;
    amount: number;
    tiers: string;
    motif: string;
    paymentmode: string;
    observation: string;
    createdat: string;
    createdbyname: string;
    suppliername: string;
    supplierbalance: number;
    referenceid: number;
    referencetype: string;
}

const formatCurrencyDZD = (amount: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount || 0);

const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('fr-DZ');

export default function SupplierVersementsSection() {
    const [versements, setVersements] = useState<SupplierVersement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });
    const [totalVersement, setTotalVersement] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [editingVersement, setEditingVersement] = useState<SupplierVersement | null>(null);

    useEffect(() => {
        fetchVersements();
    }, [dateRange, searchQuery]);

    const fetchVersements = async () => {
        setIsLoading(true);
        try {
            const params: any = {};
            if (dateRange.startDate) params.startDate = dateRange.startDate;
            if (dateRange.endDate) params.endDate = dateRange.endDate;
            if (searchQuery) params.search = searchQuery;

            const response = await api.getSupplierVersements(params) as any;
            if (response.success) {
                setVersements(response.data || []);
                setTotalVersement(response.total || 0);
            }
        } catch (error) {
            console.error('Error fetching supplier versements:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDateFilterChange = (range: DateRange, preset: DateFilterPreset) => {
        setDateRange({
            startDate: range.startDate,
            endDate: range.endDate
        });
    };

    const handleDelete = async (versement: SupplierVersement) => {
        if (!window.confirm(`Voulez-vous vraiment supprimer ce paiement de ${formatCurrencyDZD(versement.amount)} ?`)) return;
        try {
            const response = await api.deleteCashTransaction(versement.transactionid);
            if (response.success) {
                fetchVersements();
            } else {
                alert('Erreur: ' + response.message);
            }
        } catch (e: any) {
            alert('Erreur: ' + e.message);
        }
    };

    const handleEdit = (versement: SupplierVersement) => {
        setEditingVersement(versement);
        setShowModal(true);
    };

    const handleAdd = () => {
        setEditingVersement(null);
        setShowModal(true);
    };

    const handleModalClose = () => {
        setShowModal(false);
        setEditingVersement(null);
    };

    const handleModalSave = () => {
        handleModalClose();
        fetchVersements();
    };

    const getPaymentModeLabel = (mode: string) => {
        const modes: Record<string, string> = {
            'ESPECES': 'Espèces',
            'CHEQUE': 'Chèque',
            'VIREMENT': 'Virement',
        };
        return modes[mode] || mode || 'Espèces';
    };

    return (
        <div className="space-y-4">
            {/* Filter Bar */}
            <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-xs text-slate-500 mb-2 font-medium">📅 Filtrer par date:</p>
                        <DateQuickFilter
                            onFilterChange={handleDateFilterChange}
                            defaultPreset="ALL"
                            showCustom={true}
                        />
                    </div>
                    <button
                        onClick={handleAdd}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm"
                    >
                        + Ajouter un Paiement
                    </button>
                </div>

                {/* Search Bar */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="relative max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Rechercher par fournisseur, motif..."
                            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Versements Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <p className="p-10 text-center text-slate-500">Chargement...</p>
                ) : versements.length === 0 ? (
                    <p className="p-10 text-center text-slate-400">Aucun paiement fournisseur trouvé.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3">Compte</th>
                                    <th className="px-4 py-3">Fournisseur</th>
                                    <th className="px-4 py-3">Motif</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3 text-right">Montant</th>
                                    <th className="px-4 py-3">Mode de Règlement</th>
                                    <th className="px-4 py-3">Ajouté Par</th>
                                    <th className="px-4 py-3">Observation</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {versements.map((v) => (
                                    <tr key={v.transactionid} className="hover:bg-slate-50 transition">
                                        <td className="px-4 py-3 text-orange-600 font-medium">{v.accountname}</td>
                                        <td className="px-4 py-3 font-medium">{v.suppliername || v.tiers}</td>
                                        <td className="px-4 py-3 text-slate-600">{v.motif || '-'}</td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(v.createdat)}</td>
                                        <td className="px-4 py-3 text-right font-bold text-orange-600">{formatCurrencyDZD(v.amount)}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">
                                                {getPaymentModeLabel(v.paymentmode)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{v.createdbyname || '-'}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate" title={v.observation}>
                                            {v.observation || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex gap-1 justify-center">
                                                <button
                                                    onClick={() => handleEdit(v)}
                                                    className="p-1.5 rounded hover:bg-orange-50 text-orange-600 hover:text-orange-700 transition"
                                                    title="Modifier"
                                                >
                                                    ✎
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(v)}
                                                    className="p-1.5 rounded hover:bg-red-50 text-red-600 hover:text-red-700 transition"
                                                    title="Supprimer"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Total Footer */}
            {!isLoading && versements.length > 0 && (
                <div className="flex justify-center">
                    <div className="bg-orange-500 text-white px-6 py-3 rounded-lg shadow-lg">
                        <div className="text-2xl font-bold text-center">{formatCurrencyDZD(totalVersement)}</div>
                        <div className="text-sm text-center opacity-90">Total Paiements Fournisseurs</div>
                    </div>
                </div>
            )}

            {/* Versement Modal */}
            {showModal && (
                <SupplierVersementModal
                    isOpen={showModal}
                    onClose={handleModalClose}
                    onSave={handleModalSave}
                    editData={editingVersement}
                />
            )}
        </div>
    );
}

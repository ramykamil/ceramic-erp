'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface Factory {
    factoryid: number;
    factoryname: string;
}

interface Settlement {
    settlementid: number;
    factoryid: number;
    factoryname: string;
    startdate: string;
    enddate: string;
    totalamount: number;
    status: 'PENDING' | 'PAID';
    createdat: string;
}

export default function SettlementsPage() {
    const [factories, setFactories] = useState<Factory[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // Form State
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | ''>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [factoriesRes, settlementsRes] = await Promise.all([
                api.getSettlementFactories(),
                api.getSettlements()
            ]);

            if (factoriesRes.success) {
                setFactories((factoriesRes.data as Factory[]) || []);
            }
            if (settlementsRes.success) {
                setSettlements((settlementsRes.data as Settlement[]) || []);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFactoryId || !startDate || !endDate) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        setIsGenerating(true);
        try {
            const res = await api.generateSettlement({
                factoryId: Number(selectedFactoryId),
                startDate,
                endDate
            });

            if (res.success) {
                alert('Règlement généré avec succès !');
                // Refresh list
                const settlementsRes = await api.getSettlements();
                if (settlementsRes.success) {
                    setSettlements((settlementsRes.data as Settlement[]) || []);
                }
                // Reset form
                setSelectedFactoryId('');
                setStartDate('');
                setEndDate('');
            } else {
                alert(res.message || 'Erreur lors de la génération');
            }
        } catch (error: any) {
            console.error('Error generating settlement:', error);
            alert(error.message || 'Erreur lors de la génération');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleMarkAsPaid = async (id: number) => {
        if (!confirm('Confirmer le paiement de ce règlement ?')) return;

        try {
            const res = await api.updateSettlementStatus(id, 'PAID');
            if (res.success) {
                // Update local state
                setSettlements(settlements.map(s =>
                    s.settlementid === id ? { ...s, status: 'PAID' } : s
                ));
            }
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Erreur lors de la mise à jour du statut');
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('fr-FR');
    };

    return (
        <div className="p-6 min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <Link href="/" className="text-sm text-slate-500 hover:text-blue-600 mb-2 block">← Retour Tableau de Bord</Link>
                        <h1 className="text-3xl font-bold text-slate-800">Règlements Usines</h1>
                        <p className="text-slate-600">Générez et suivez les paiements dus aux usines basés sur les ventes.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Panel: Generator Form */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-6">
                            <h2 className="text-xl font-semibold text-slate-800 mb-4">Nouveau Règlement</h2>
                            <form onSubmit={handleGenerate} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Usine</label>
                                    <select
                                        value={selectedFactoryId}
                                        onChange={(e) => setSelectedFactoryId(Number(e.target.value))}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        required
                                    >
                                        <option value="">-- Sélectionner --</option>
                                        {factories.map(f => (
                                            <option key={f.factoryid} value={f.factoryid}>{f.factoryname}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date Début</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date Fin</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isGenerating || isLoading}
                                    className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-semibold transition duration-200 mt-4"
                                >
                                    {isGenerating ? 'Calcul en cours...' : 'Générer Règlement'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Right Panel: History List */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-200">
                                <h2 className="text-xl font-semibold text-slate-800">Historique des Règlements</h2>
                            </div>

                            {isLoading ? (
                                <p className="text-center py-12 text-slate-500">Chargement...</p>
                            ) : settlements.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <p>Aucun règlement trouvé.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="p-4 font-semibold text-slate-700">Date Création</th>
                                                <th className="p-4 font-semibold text-slate-700">Usine</th>
                                                <th className="p-4 font-semibold text-slate-700">Période</th>
                                                <th className="p-4 font-semibold text-slate-700 text-right">Montant</th>
                                                <th className="p-4 font-semibold text-slate-700 text-center">Statut</th>
                                                <th className="p-4 font-semibold text-slate-700 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {settlements.map((settlement) => (
                                                <tr key={settlement.settlementid} className="hover:bg-slate-50">
                                                    <td className="p-4 text-sm text-slate-600">
                                                        {new Date(settlement.createdat).toLocaleDateString()}
                                                    </td>
                                                    <td className="p-4 font-medium text-slate-800">
                                                        {settlement.factoryname}
                                                    </td>
                                                    <td className="p-4 text-sm text-slate-600">
                                                        {formatDate(settlement.startdate)} - {formatDate(settlement.enddate)}
                                                    </td>
                                                    <td className="p-4 text-right font-bold text-slate-800">
                                                        {formatCurrency(settlement.totalamount)}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${settlement.status === 'PAID'
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {settlement.status === 'PAID' ? 'PAYÉ' : 'EN ATTENTE'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        {settlement.status === 'PENDING' && (
                                                            <button
                                                                onClick={() => handleMarkAsPaid(settlement.settlementid)}
                                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                                            >
                                                                Marquer Payé
                                                            </button>
                                                        )}
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
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DateQuickFilter, DateRange, DateFilterPreset } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';

// --- Interfaces ---
interface SupplierHistory {
    factoryid: number; // Aliased as factoryid from backend for compatibility
    factoryname: string;
    suppliertype: 'FACTORY' | 'BRAND';
    totalbought: number;
    totalpaid: number;
    totalleft: number;
    ordercount: number;
}

// Factories are now populated from Brands (each brand has a corresponding factory)
interface Factory {
    factoryid: number;
    factoryname: string;
    contactperson?: string;
    phone?: string;
    email?: string;
}

interface Brand {
    brandid: number;
    brandname: string;
}

interface SupplierOption {
    id: number;
    name: string;
    type: 'FACTORY' | 'BRAND';
}

interface FactoryDetail {
    factory: {
        factoryid: number;
        factoryname: string;
        contactperson: string;
        phone: string;
        email: string;
    };
    orders: {
        purchaseorderid: number;
        ponumber: string;
        orderdate: string;
        status: string;
        totalamount: number;
        ownershiptype: string;
        warehousename: string;
        amountpaid: number;
        amountleft: number;
    }[];
    payments: {
        transactionid: number;
        transactiondate: string;
        amount: number;
        description: string;
        ponumber: string;
    }[];
    totals: { totalBought: number; totalPaid: number; totalLeft: number; initialBalance: number };
}

// --- Helpers ---
const formatCurrencyDZD = (amount: number | null | undefined): string => {
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) return "0,00 DZD";
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(numericAmount);
};

const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    try {
        return new Date(dateString).toLocaleDateString('fr-DZ', {
            year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
        });
    } catch (e) { return dateString; }
};

const getStatusBadge = (status: string): string => {
    const statusClasses: Record<string, string> = {
        PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
        APPROVED: 'bg-blue-50 text-blue-700 border border-blue-200',
        RECEIVED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        PARTIAL: 'bg-purple-50 text-purple-700 border border-purple-200',
        CANCELLED: 'bg-red-50 text-red-700 border border-red-200',
    };
    return statusClasses[status] || 'bg-slate-50 text-slate-700 border border-slate-200';
};

// --- Component ---
export default function PurchaseHistoryPage() {
    const [historyData, setHistoryData] = useState<SupplierHistory[]>([]);
    const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<{ id: number; type: 'FACTORY' | 'BRAND' } | null>(null);
    const [factoryDetail, setFactoryDetail] = useState<FactoryDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'orders' | 'payments'>('orders');
    const router = useRouter();

    // Summary totals
    const [summary, setSummary] = useState({ totalBought: 0, totalPaid: 0, totalLeft: 0, orderCount: 0 });
    const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    useEffect(() => {
        fetchData();
    }, [dateRange, selectedUserId]);

    useEffect(() => {
        if (selectedSupplier) {
            fetchFactoryDetails(selectedSupplier.id, selectedSupplier.type);
        } else {
            setFactoryDetail(null);
        }
    }, [selectedSupplier]);

    const fetchData = async () => {
        setIsLoading(true);
        setApiError(null);
        try {
            const historyParams: any = {};
            if (dateRange.startDate) historyParams.startDate = dateRange.startDate;
            if (dateRange.endDate) historyParams.endDate = dateRange.endDate;
            if (selectedUserId) historyParams.buyerId = selectedUserId;

            const [historyRes, factoriesRes, brandsRes] = await Promise.all([
                api.getPurchaseHistory(historyParams),
                api.getFactories(),
                api.getBrands()
            ]);

            if (historyRes.success) {
                setHistoryData((historyRes.data as SupplierHistory[]) || []);
                // Calculate summary from the response
                const data = historyRes.data as SupplierHistory[];
                const totals = data.reduce((acc, row) => ({
                    totalBought: acc.totalBought + parseFloat(String(row.totalbought || 0)),
                    totalPaid: acc.totalPaid + parseFloat(String(row.totalpaid || 0)),
                    totalLeft: acc.totalLeft + parseFloat(String(row.totalleft || 0)),
                    orderCount: acc.orderCount + parseInt(String(row.ordercount || 0))
                }), { totalBought: 0, totalPaid: 0, totalLeft: 0, orderCount: 0 });
                setSummary(totals);
            }

            const newSuppliers: SupplierOption[] = [];
            if (factoriesRes.success) {
                const fData = (factoriesRes.data as Factory[]) || [];
                fData.forEach(f => newSuppliers.push({ id: f.factoryid, name: f.factoryname, type: 'FACTORY' }));
            }
            if (brandsRes.success) {
                const bData = (brandsRes.data as Brand[]) || [];
                bData.forEach(b => newSuppliers.push({ id: b.brandid, name: b.brandname, type: 'BRAND' }));
            }
            setSuppliers(newSuppliers);

        } catch (error: any) {
            console.error('Erreur chargement historique:', error);
            if (error.message?.includes('token') || error.message?.includes('Authentication')) {
                router.push('/login');
            }
            setApiError(`Erreur: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchFactoryDetails = async (supplierId: number, supplierType: 'FACTORY' | 'BRAND') => {
        setIsLoadingDetail(true);
        try {
            // Pass supplierType to the API (need to ensure API client supports it or pass it as query param)
            // Assuming api.getFactoryPurchaseDetails accepts query params as second arg or modify client
            // Since we don't have direct access to modify api client here easily without viewing it, 
            // we'll assume we used a standard GET with params. 
            // Let's assume we can construct the URL manually if needed, or api function needs update.
            // Checking standard api call...
            // Cast to any to bypass strict type checking for now as we added a param backend side but maybe not in frontend definition
            const response = await api.getFactoryPurchaseDetails(supplierId, { type: supplierType } as any);
            if (response.success && response.data) {
                setFactoryDetail(response.data);
            }
        } catch (error: any) {
            console.error('Erreur chargement détails:', error);
            setApiError(`Erreur: ${error.message}`);
        } finally {
            setIsLoadingDetail(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50 text-slate-800">
            <div className="max-w-7xl mx-auto">

                {/* --- Header --- */}
                <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Historique des Achats</h1>
                        <p className="text-slate-500 text-sm mt-1">Suivi des achats par fournisseur avec totaux détaillés</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            href="/purchasing"
                            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                            </svg>
                            Retour aux Achats
                        </Link>
                    </div>
                </div>

                {/* --- Date Quick Filter --- */}
                <div className="mb-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs text-slate-500 mb-2 font-medium">📅 Filtrer par date:</p>
                            <DateQuickFilter
                                onFilterChange={(range) => setDateRange(range)}
                                defaultPreset="ALL"
                                showCustom={true}
                            />
                        </div>
                        <UserFilter
                            onUserChange={(userId) => setSelectedUserId(userId)}
                            label="Acheteur"
                        />
                    </div>
                </div>

                {/* --- Error Display --- */}
                {apiError && (
                    <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                        <strong>Erreur:</strong> {apiError}
                    </div>
                )}

                {/* --- Summary Cards --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Total Acheté</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrencyDZD(summary.totalBought)}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Total Payé</p>
                        <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrencyDZD(summary.totalPaid)}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Reste à Payer</p>
                        <p className={`text-2xl font-bold mt-1 ${summary.totalLeft > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                            {formatCurrencyDZD(summary.totalLeft)}
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Nombre de Commandes</p>
                        <p className="text-2xl font-bold text-blue-600 mt-1">{summary.orderCount}</p>
                    </div>
                </div>

                {/* --- Filter Bar --- */}
                <div className="mb-6 flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <label htmlFor="factoryFilter" className="text-sm font-medium text-slate-700 whitespace-nowrap">
                        Fournisseur :
                    </label>
                    <select
                        id="factoryFilter"
                        value={selectedSupplier ? `${selectedSupplier.type}_${selectedSupplier.id}` : ''}
                        onChange={(e) => {
                            if (!e.target.value) {
                                setSelectedSupplier(null);
                            } else {
                                const [type, idStr] = e.target.value.split('_');
                                setSelectedSupplier({ id: Number(idStr), type: type as 'FACTORY' | 'BRAND' });
                            }
                        }}
                        className="w-full sm:w-64 p-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">Tous les Fournisseurs</option>
                        {suppliers.map((s) => (
                            <option key={`${s.type}_${s.id}`} value={`${s.type}_${s.id}`}>
                                {s.name} ({s.type === 'FACTORY' ? 'Usine' : 'Marque'})
                            </option>
                        ))}
                    </select>
                    {selectedSupplier && (
                        <button
                            onClick={() => setSelectedSupplier(null)}
                            className="text-slate-500 hover:text-slate-700 text-sm"
                        >
                            ✕ Effacer
                        </button>
                    )}
                </div>

                {/* --- Main Content Area --- */}
                {isLoading ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-center py-20">
                            <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500">Chargement...</p>
                        </div>
                    </div>
                ) : selectedSupplier && factoryDetail ? (
                    /* --- Factory Detail View --- */
                    <div className="space-y-6">
                        {/* Factory Info Card */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-slate-800">{factoryDetail.factory.factoryname}</h2>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${selectedSupplier.type === 'BRAND' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {selectedSupplier.type === 'BRAND' ? 'MARQUE' : 'USINE'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                                        {factoryDetail.factory.contactperson && (
                                            <span>👤 {factoryDetail.factory.contactperson}</span>
                                        )}
                                        {factoryDetail.factory.phone && (
                                            <span>📞 {factoryDetail.factory.phone}</span>
                                        )}
                                        {factoryDetail.factory.email && (
                                            <span>✉️ {factoryDetail.factory.email}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-4 text-center">
                                    <div className="bg-slate-50 px-4 py-2 rounded-lg">
                                        <p className="text-xs text-slate-500">Acheté</p>
                                        <p className="text-lg font-bold text-slate-800">{formatCurrencyDZD(factoryDetail.totals.totalBought)}</p>
                                    </div>
                                    {factoryDetail.totals.initialBalance > 0 && (
                                        <div className="bg-amber-50 px-4 py-2 rounded-lg">
                                            <p className="text-xs text-amber-600">Ancien Crédit</p>
                                            <p className="text-lg font-bold text-amber-600">{formatCurrencyDZD(factoryDetail.totals.initialBalance)}</p>
                                        </div>
                                    )}
                                    <div className="bg-emerald-50 px-4 py-2 rounded-lg">
                                        <p className="text-xs text-emerald-600">Payé</p>
                                        <p className="text-lg font-bold text-emerald-600">{formatCurrencyDZD(factoryDetail.totals.totalPaid)}</p>
                                    </div>
                                    <div className={`px-4 py-2 rounded-lg ${factoryDetail.totals.totalLeft > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                                        <p className={`text-xs ${factoryDetail.totals.totalLeft > 0 ? 'text-red-600' : 'text-slate-500'}`}>Reste</p>
                                        <p className={`text-lg font-bold ${factoryDetail.totals.totalLeft > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                                            {formatCurrencyDZD(factoryDetail.totals.totalLeft)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 border-b border-slate-200">
                            <button
                                onClick={() => setActiveTab('orders')}
                                className={`px-4 py-2 text-sm font-medium transition ${activeTab === 'orders'
                                    ? 'text-blue-600 border-b-2 border-blue-600'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Commandes ({factoryDetail.orders.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('payments')}
                                className={`px-4 py-2 text-sm font-medium transition ${activeTab === 'payments'
                                    ? 'text-blue-600 border-b-2 border-blue-600'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Paiements ({factoryDetail.payments.length})
                            </button>
                        </div>

                        {/* Tab Content */}
                        {isLoadingDetail ? (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                                <div className="text-center py-10">
                                    <div className="inline-block w-6 h-6 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                                </div>
                            </div>
                        ) : activeTab === 'orders' ? (
                            <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                                            <tr>
                                                <th scope="col" className="px-6 py-4">Numéro</th>
                                                <th scope="col" className="px-6 py-4">Date</th>
                                                <th scope="col" className="px-6 py-4">Entrepôt</th>
                                                <th scope="col" className="px-6 py-4 text-right">Montant</th>
                                                <th scope="col" className="px-6 py-4 text-right">Payé</th>
                                                <th scope="col" className="px-6 py-4 text-right">Reste</th>
                                                <th scope="col" className="px-6 py-4 text-center">Statut</th>
                                                <th scope="col" className="px-6 py-4 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {factoryDetail.orders.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="text-center py-10 text-slate-400">
                                                        Aucune commande trouvée
                                                    </td>
                                                </tr>
                                            ) : (
                                                factoryDetail.orders.map((order) => (
                                                    <tr key={order.purchaseorderid} className="hover:bg-slate-50 transition-colors duration-150">
                                                        <td className="px-6 py-4 font-mono text-slate-500 font-medium">{order.ponumber}</td>
                                                        <td className="px-6 py-4 text-slate-500">{formatDate(order.orderdate)}</td>
                                                        <td className="px-6 py-4 text-slate-600">{order.warehousename}</td>
                                                        <td className="px-6 py-4 text-right font-medium text-slate-800">{formatCurrencyDZD(order.totalamount)}</td>
                                                        <td className="px-6 py-4 text-right text-emerald-600">{formatCurrencyDZD(order.amountpaid)}</td>
                                                        <td className={`px-6 py-4 text-right font-medium ${parseFloat(String(order.amountleft)) > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                                            {formatCurrencyDZD(order.amountleft)}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(order.status)}`}>
                                                                {order.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <Link
                                                                href={`/purchasing/${order.purchaseorderid}`}
                                                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded transition font-medium text-xs"
                                                            >
                                                                Voir
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                                            <tr>
                                                <th scope="col" className="px-6 py-4">Date</th>
                                                <th scope="col" className="px-6 py-4">N° Commande</th>
                                                <th scope="col" className="px-6 py-4">Description</th>
                                                <th scope="col" className="px-6 py-4 text-right">Montant</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {factoryDetail.payments.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="text-center py-10 text-slate-400">
                                                        Aucun paiement trouvé
                                                    </td>
                                                </tr>
                                            ) : (
                                                factoryDetail.payments.map((payment) => (
                                                    <tr key={payment.transactionid} className="hover:bg-slate-50 transition-colors duration-150">
                                                        <td className="px-6 py-4 text-slate-500">{formatDate(payment.transactiondate)}</td>
                                                        <td className="px-6 py-4 font-mono text-slate-500">{payment.ponumber}</td>
                                                        <td className="px-6 py-4 text-slate-600">{payment.description}</td>
                                                        <td className="px-6 py-4 text-right font-medium text-emerald-600">{formatCurrencyDZD(payment.amount)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* --- Overview Table (All Factories) --- */
                    <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                        {historyData.length === 0 ? (
                            <div className="text-center py-20 text-slate-400">
                                <p className="text-lg">Aucune donnée d'historique disponible.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 font-semibold border-b border-slate-100">
                                        <tr>
                                            <th scope="col" className="px-6 py-4">Fournisseur</th>
                                            <th scope="col" className="px-6 py-4 text-center">Commandes</th>
                                            <th scope="col" className="px-6 py-4 text-right">Total Acheté</th>
                                            <th scope="col" className="px-6 py-4 text-right">Total Payé</th>
                                            <th scope="col" className="px-6 py-4 text-right">Reste à Payer</th>
                                            <th scope="col" className="px-6 py-4 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {historyData.map((row) => (
                                            <tr key={row.factoryid} className="hover:bg-slate-50 transition-colors duration-150">
                                                <td className="px-6 py-4 font-medium text-slate-800">{row.factoryname}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                                                        {row.ordercount}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-800">{formatCurrencyDZD(row.totalbought)}</td>
                                                <td className="px-6 py-4 text-right text-emerald-600">{formatCurrencyDZD(row.totalpaid)}</td>
                                                <td className={`px-6 py-4 text-right font-medium ${parseFloat(String(row.totalleft)) > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                                    {formatCurrencyDZD(row.totalleft)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setSelectedSupplier({ id: row.factoryid, type: row.suppliertype })}
                                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded transition font-medium text-xs inline-flex items-center gap-1"
                                                    >
                                                        <span>Détails</span>
                                                        <span>→</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

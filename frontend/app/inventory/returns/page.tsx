'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useReactToPrint } from 'react-to-print';
import { StandardDocument, DocumentData } from '@/components/print/StandardDocument';
import { DateQuickFilter, DateRange } from '@/components/DateQuickFilter';
import { UserFilter } from '@/components/UserFilter';

// --- Interfaces ---
interface Return {
    returnid: number;
    returnnumber: string;
    orderid: number | null;
    customerid: number;
    customername: string;
    returndate: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'PROCESSED' | 'REJECTED';
    totalamount: number;
    notes: string;
    createdat: string;
    itemcount: number;
}

interface ReturnDetail extends Return {
    ordernumber: string | null;
    customerphone: string | null;
    customeraddress: string | null;
    items: ReturnItem[];
}

interface ReturnItem {
    returnitemid: number;
    productid: number;
    productcode: string;
    productname: string;
    quantity: number;
    unitid: number;
    unitcode: string;
    unitprice: number;
    linetotal: number;
    reason: string;
}

interface Customer {
    customerid: number;
    customername: string;
}

interface Product {
    productid: number;
    productcode: string;
    productname: string;
    baseprice: number;
    prixvente?: number;
    derivedpiecespercolis?: number;
    derivedcolisperpalette?: number;
}

// Form item with full quantity details like POS
interface ReturnFormItem {
    productId: number;
    productCode: string;
    productName: string;
    palettes: number;
    cartons: number;
    quantity: number;  // pieces
    piecesPerCarton: number;
    cartonsPerPalette: number;
    sqmPerPiece: number;
    sqmTotal: number;
    unitPrice: number;
    lineTotal: number;
}

// --- Helper ---
const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-DZ');
};

// Parse SQM per piece from product name (same as POS)
const parseSqmPerPiece = (productName: string): number => {
    const sizeMatch = productName.match(/(\d+)[\/x](\d+)/i);
    if (sizeMatch) {
        const dim1 = parseInt(sizeMatch[1]);
        const dim2 = parseInt(sizeMatch[2]);
        return (dim1 * dim2) / 10000; // cm² to m²
    }
    return 0;
};

const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-700',
        APPROVED: 'bg-blue-100 text-blue-700',
        PROCESSED: 'bg-green-100 text-green-700',
        REJECTED: 'bg-red-100 text-red-700',
    };
    const labels: Record<string, string> = {
        PENDING: 'En attente',
        APPROVED: 'Approuvé',
        PROCESSED: 'Traité',
        REJECTED: 'Rejeté',
    };
    return (
        <span className={`px-2 py-1 rounded text-xs font-medium ${badges[status] || 'bg-gray-100'}`}>
            {labels[status] || status}
        </span>
    );
};

export default function ReturnsPage() {
    // --- State ---
    const [returns, setReturns] = useState<Return[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });
    const [filteredReturns, setFilteredReturns] = useState<Return[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    // --- Modal State ---
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedReturn, setSelectedReturn] = useState<ReturnDetail | null>(null);

    // --- Create Form State ---
    const [formCustomerId, setFormCustomerId] = useState<number | ''>('');
    const [isManualClient, setIsManualClient] = useState(false);
    const [manualClientName, setManualClientName] = useState('');
    const [manualClientPhone, setManualClientPhone] = useState('');
    const [manualClientAddress, setManualClientAddress] = useState('');
    const [formReason, setFormReason] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [formItems, setFormItems] = useState<ReturnFormItem[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Print Ref ---
    const printRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: selectedReturn ? `BonDeRetour_${selectedReturn.returnnumber}` : 'BonDeRetour',
    });

    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

    // Filter customers for dropdown
    const filteredCustomers = customerSearch.length > 0
        ? customers.filter(c => c.customername.toLowerCase().includes(customerSearch.toLowerCase())).slice(0, 10)
        : [];

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const params: any = {};
                if (selectedUserId) params.createdBy = selectedUserId;

                const [returnsRes, customersRes, productsRes] = await Promise.all([
                    api.getReturns(params),
                    api.getCustomers({ limit: 5000 }), // Increased limit
                    api.getProducts({ limit: 5000 }),
                ]);

                if (returnsRes.success) setReturns(returnsRes.data || []);
                if (customersRes.success) setCustomers((customersRes.data || []) as Customer[]);
                if (productsRes.success) setProducts((productsRes.data || []) as Product[]);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [selectedUserId]);

    // Filter returns by date
    useEffect(() => {
        if (dateRange.startDate || dateRange.endDate) {
            const filtered = returns.filter(r => {
                const returnDate = new Date(r.returndate);
                const start = dateRange.startDate ? new Date(dateRange.startDate) : null;
                const end = dateRange.endDate ? new Date(dateRange.endDate + 'T23:59:59') : null;

                if (start && returnDate < start) return false;
                if (end && returnDate > end) return false;
                return true;
            });
            setFilteredReturns(filtered);
        } else {
            setFilteredReturns(returns);
        }
    }, [returns, dateRange]);

    // --- View Return Details ---
    const viewReturnDetails = async (id: number) => {
        try {
            const res = await api.getReturnById(id);
            if (res.success) {
                setSelectedReturn(res.data);
                setIsDetailModalOpen(true);
            }
        } catch (err: any) {
            alert('Erreur: ' + err.message);
        }
    };

    // --- Product Search Filter ---
    const filteredProducts = productSearch.length > 1
        ? products.filter(p =>
            p.productname?.toLowerCase().includes(productSearch.toLowerCase()) ||
            p.productcode?.toLowerCase().includes(productSearch.toLowerCase())
        ).slice(0, 20)
        : [];

    // --- Add Product to Form with packaging info ---
    const addProductToForm = (product: Product) => {
        if (formItems.find(i => i.productId === product.productid)) return;

        const piecesPerCarton = product.derivedpiecespercolis || 0;
        const cartonsPerPalette = product.derivedcolisperpalette || 0;
        const sqmPerPiece = parseSqmPerPiece(product.productname);
        const unitPrice = product.prixvente || product.baseprice || 0;

        const newItem: ReturnFormItem = {
            productId: product.productid,
            productCode: product.productcode,
            productName: product.productname,
            palettes: 0,
            cartons: 0,
            quantity: 1,
            piecesPerCarton,
            cartonsPerPalette,
            sqmPerPiece,
            sqmTotal: sqmPerPiece * 1,
            unitPrice,
            lineTotal: unitPrice * 1,
        };

        setFormItems([...formItems, newItem]);
        setProductSearch('');
    };

    // --- Update Form Item with Auto-Calculation (EXACT POS LOGIC) ---
    const updateFormItem = (index: number, field: string, value: any) => {
        const newItems = [...formItems];
        const item = newItems[index];

        (item as any)[field] = value;

        // Auto-calculate palettes and cartons when QUANTITY changes
        // Use Math.floor to show only COMPLETE cartons/palettes (not rounded up)
        if (field === 'quantity') {
            const qty = Number(value);
            // Only auto-calculate if piecesPerCarton is available
            if (item.piecesPerCarton > 0) {
                const calculatedCartons = Math.floor(qty / item.piecesPerCarton);
                item.cartons = calculatedCartons;

                if (item.cartonsPerPalette > 0) {
                    item.palettes = Math.floor(calculatedCartons / item.cartonsPerPalette);
                }
            }
        }

        // When CARTONS is manually edited, recalculate quantity and palettes
        if (field === 'cartons') {
            const cartons = Number(value);
            // Recalculate quantity from cartons
            if (item.piecesPerCarton > 0) {
                item.quantity = cartons * item.piecesPerCarton;
            }
            // Recalculate palettes from cartons
            if (item.cartonsPerPalette > 0) {
                item.palettes = Math.floor(cartons / item.cartonsPerPalette);
            }
        }

        // When PALETTES is manually edited, recalculate cartons and quantity
        if (field === 'palettes') {
            const palettes = Number(value);
            // Recalculate cartons from palettes
            if (item.cartonsPerPalette > 0) {
                item.cartons = palettes * item.cartonsPerPalette;
                // Recalculate quantity from cartons
                if (item.piecesPerCarton > 0) {
                    item.quantity = item.cartons * item.piecesPerCarton;
                }
            }
        }

        // Always recalculate derived values
        item.sqmTotal = item.quantity * item.sqmPerPiece;
        item.lineTotal = item.quantity * item.unitPrice;

        setFormItems(newItems);
    };

    // --- Remove Form Item ---
    const removeFormItem = (index: number) => {
        const newItems = [...formItems];
        newItems.splice(index, 1);
        setFormItems(newItems);
    };

    // --- Submit Create Return ---
    const handleCreateReturn = async () => {
        // Validate client
        if (isManualClient) {
            if (!manualClientName.trim()) {
                alert('Veuillez entrer le nom du client');
                return;
            }
        } else {
            if (!formCustomerId) {
                alert('Veuillez sélectionner un client');
                return;
            }
        }
        if (formItems.length === 0) {
            alert('Veuillez ajouter au moins un produit');
            return;
        }

        setIsSubmitting(true);
        try {
            const returnData: any = {
                reason: formReason,
                notes: formNotes,
                items: formItems.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                })),
            };

            if (isManualClient) {
                returnData.clientName = manualClientName.trim();
                returnData.clientPhone = manualClientPhone.trim();
                returnData.clientAddress = manualClientAddress.trim();
            } else {
                returnData.customerId = formCustomerId as number;
            }

            const res = await api.createReturn(returnData);

            if (res.success) {
                alert(`✅ Retour ${(res.data as any).returnNumber} créé avec succès!`);
                // Reload returns
                const returnsRes = await api.getReturns();
                if (returnsRes.success) setReturns(returnsRes.data || []);
                // Reset form
                setIsCreateModalOpen(false);
                setFormCustomerId('');
                setCustomerSearch(''); // Reset search
                setIsCustomerDropdownOpen(false);
                setIsManualClient(false);
                setManualClientName('');
                setManualClientPhone('');
                setManualClientAddress('');
                setFormReason('');
                setFormNotes('');
                setFormItems([]);
            } else {
                throw new Error(res.message);
            }
        } catch (err: any) {
            alert('❌ Erreur: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Delete Return ---
    const handleDeleteReturn = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce retour? Le stock sera rétabli.')) return;

        try {
            const res = await api.deleteReturn(id);
            if (res.success) {
                alert('✅ Retour supprimé');
                setReturns(returns.filter(r => r.returnid !== id));
            }
        } catch (err: any) {
            alert('❌ Erreur: ' + err.message);
        }
    };

    // --- Approve Return ---
    const handleApproveReturn = async (id: number) => {
        if (!confirm('Approuver ce retour? Une fois approuvé, le stock sera réintégré.')) return;

        try {
            const res = await api.updateReturnStatus(id, 'APPROVED');
            if (res.success) {
                alert('✅ Retour approuvé et stock mis à jour');
                // Reload
                const returnsRes = await api.getReturns();
                if (returnsRes.success) setReturns(returnsRes.data || []);
            } else {
                throw new Error(res.message);
            }
        } catch (err: any) {
            alert('❌ Erreur: ' + err.message);
        }
    };

    // --- Get Print Data ---
    const getPrintData = (): DocumentData => {
        if (!selectedReturn) {
            return { number: '', date: '', items: [] };
        }
        return {
            number: selectedReturn.returnnumber,
            date: selectedReturn.returndate,
            clientName: selectedReturn.customername,
            clientAddress: selectedReturn.customeraddress || '',
            clientPhone: selectedReturn.customerphone || '',
            items: selectedReturn.items.map(item => {
                // Look up packaging info from products array
                const product = products.find(p => p.productid === item.productid);
                const piecesPerCarton = product?.derivedpiecespercolis || undefined;
                const cartonsPerPalette = product?.derivedcolisperpalette || undefined;

                // Calculate box/pallet counts from quantity if packaging info available
                const boxCount = piecesPerCarton && piecesPerCarton > 0 ? parseFloat((item.quantity / piecesPerCarton).toFixed(2)) : undefined;
                const palletCount = boxCount && cartonsPerPalette && cartonsPerPalette > 0 ? parseFloat((boxCount / cartonsPerPalette).toFixed(2)) : undefined;

                return {
                    productCode: item.productcode,
                    productName: item.productname,
                    quantity: item.quantity,
                    unitCode: item.unitcode || 'PCS',
                    unitPrice: item.unitprice,
                    lineTotal: item.linetotal,
                    piecesPerCarton,
                    cartonsPerPalette,
                    boxCount,
                    palletCount,
                };
            }),
            totalHT: selectedReturn.totalamount,
        };
    };

    // --- Calculate Form Total ---
    const formTotal = formItems.reduce((sum, item) => sum + item.lineTotal, 0);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-slate-600">Chargement...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Retours (Bons de Retour)</h1>
                        <p className="text-slate-500 text-sm">Gérer les retours de marchandise</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/inventory" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">
                            ← Inventaire
                        </Link>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                            + Nouveau Retour
                        </button>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">
                        <strong>Erreur:</strong> {error}
                    </div>
                )}

                {/* Date Quick Filter */}
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
                        <div className="flex items-center gap-4">
                            <UserFilter
                                onUserChange={(userId) => setSelectedUserId(userId)}
                                label="Responsable"
                            />
                            <span className="text-sm text-slate-500">{filteredReturns.length} retour(s)</span>
                        </div>
                    </div>
                </div>

                {/* Returns Table */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">N° Retour</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Client</th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600">Articles</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600">Statut</th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredReturns.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">
                                            Aucun retour trouvé
                                        </td>
                                    </tr>
                                ) : (
                                    filteredReturns.map((ret) => (
                                        <tr key={ret.returnid} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-blue-600">{ret.returnnumber}</td>
                                            <td className="px-4 py-3 text-slate-600">{formatDate(ret.returndate)}</td>
                                            <td className="px-4 py-3 font-medium text-slate-800">{ret.customername}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="bg-slate-100 px-2 py-1 rounded text-slate-600">{ret.itemcount}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                                                {formatCurrency(ret.totalamount)}
                                            </td>
                                            <td className="px-4 py-3 text-center">{getStatusBadge(ret.status)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button
                                                        onClick={() => viewReturnDetails(ret.returnid)}
                                                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                                    >
                                                        Voir
                                                    </button>
                                                    {ret.status === 'PENDING' && (
                                                        <button
                                                            onClick={() => handleDeleteReturn(ret.returnid)}
                                                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                                                        >
                                                            Suppr.
                                                        </button>
                                                    )}
                                                    {ret.status === 'PENDING' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleApproveReturn(ret.returnid)}
                                                                className="text-green-600 hover:text-green-800 text-xs font-medium"
                                                            >
                                                                Appr.
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteReturn(ret.returnid)}
                                                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                                                            >
                                                                Suppr.
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Create Return Modal */}
                {isCreateModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-slate-200 bg-slate-50">
                                <h2 className="text-lg font-bold text-slate-800">Nouveau Retour</h2>
                            </div>

                            <div className="p-4 overflow-y-auto flex-1 space-y-4">
                                {/* Client Type Toggle */}
                                <div className="flex gap-2 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsManualClient(false)}
                                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition ${!isManualClient
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                            }`}
                                    >
                                        📋 Client existant
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsManualClient(true)}
                                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition ${isManualClient
                                            ? 'bg-orange-500 text-white border-orange-500'
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                            }`}
                                    >
                                        ✏️ Saisie manuelle
                                    </button>
                                </div>

                                {!isManualClient && (
                                    <div className="relative">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={customerSearch}
                                                onChange={(e) => {
                                                    setCustomerSearch(e.target.value);
                                                    setIsCustomerDropdownOpen(true);
                                                    if (e.target.value === '') setFormCustomerId('');
                                                }}
                                                onFocus={() => setIsCustomerDropdownOpen(true)}
                                                placeholder={formCustomerId ? customers.find(c => c.customerid === formCustomerId)?.customername : "🔍 Rechercher un client..."}
                                                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                            />
                                            {formCustomerId && (
                                                <button
                                                    onClick={() => {
                                                        setFormCustomerId('');
                                                        setCustomerSearch('');
                                                    }}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        {/* Dropdown Results */}
                                        {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                                                {filteredCustomers.map((c) => (
                                                    <div
                                                        key={c.customerid}
                                                        onClick={() => {
                                                            setFormCustomerId(c.customerid);
                                                            setCustomerSearch(c.customername);
                                                            setIsCustomerDropdownOpen(false);
                                                        }}
                                                        className="p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 text-sm"
                                                    >
                                                        {c.customername}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Manual Client Entry */}
                                {isManualClient && (
                                    <div className="space-y-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Nom du client *</label>
                                            <input
                                                type="text"
                                                value={manualClientName}
                                                onChange={(e) => setManualClientName(e.target.value)}
                                                placeholder="Nom complet du client"
                                                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                                                <input
                                                    type="text"
                                                    value={manualClientPhone}
                                                    onChange={(e) => setManualClientPhone(e.target.value)}
                                                    placeholder="0000000000"
                                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
                                                <input
                                                    type="text"
                                                    value={manualClientAddress}
                                                    onChange={(e) => setManualClientAddress(e.target.value)}
                                                    placeholder="Ville, quartier..."
                                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Reason */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Raison du retour</label>
                                    <input
                                        type="text"
                                        value={formReason}
                                        onChange={(e) => setFormReason(e.target.value)}
                                        placeholder="Ex: Produit défectueux, erreur de commande..."
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                </div>

                                {/* Product Search */}
                                <div className="relative">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Ajouter des produits</label>
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder="🔍 Rechercher un produit..."
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                    {filteredProducts.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                                            {filteredProducts.map((p) => (
                                                <div
                                                    key={p.productid}
                                                    onClick={() => addProductToForm(p)}
                                                    className="p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 text-sm"
                                                >
                                                    <span className="font-medium">{p.productname}</span>
                                                    <span className="text-slate-500 ml-2">({p.productcode})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Items Table - Detailed like POS */}
                                {formItems.length > 0 && (
                                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-2 py-2 text-left">Produit</th>
                                                    <th className="px-2 py-2 text-center w-16">Pal</th>
                                                    <th className="px-2 py-2 text-center w-16">Ctn</th>
                                                    <th className="px-2 py-2 text-center w-24">Qté</th>
                                                    <th className="px-2 py-2 text-right w-28">Prix U.</th>
                                                    <th className="px-2 py-2 text-right w-28">Total</th>
                                                    <th className="px-2 py-2 w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {formItems.map((item, index) => (
                                                    <tr key={index}>
                                                        <td className="px-2 py-2">
                                                            <div className="font-medium text-slate-800 text-xs">{item.productName}</div>
                                                            <div className="text-xs text-slate-400">{item.productCode}</div>
                                                            {item.piecesPerCarton > 0 && (
                                                                <div className="text-xs text-blue-500 mt-0.5">
                                                                    {item.piecesPerCarton} pcs/ctn
                                                                    {item.cartonsPerPalette > 0 && ` • ${item.cartonsPerPalette} ctn/pal`}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-1 py-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={item.palettes}
                                                                onChange={(e) => updateFormItem(index, 'palettes', Number(e.target.value))}
                                                                className="w-full p-1 border border-slate-200 rounded text-center text-xs"
                                                                disabled={item.cartonsPerPalette === 0}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={item.cartons}
                                                                onChange={(e) => updateFormItem(index, 'cartons', Number(e.target.value))}
                                                                className="w-full p-1 border border-slate-200 rounded text-center text-xs"
                                                                disabled={item.piecesPerCarton === 0}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={item.quantity}
                                                                onChange={(e) => updateFormItem(index, 'quantity', Number(e.target.value))}
                                                                className="w-full p-1 border border-blue-300 rounded text-center text-xs bg-blue-50 font-medium"
                                                            />
                                                            {/* Conversion hint - show pieces if sqmPerPiece available */}
                                                            {item.sqmPerPiece > 0 && item.quantity > 0 && (
                                                                <div className="text-xs text-center mt-0.5 text-slate-500">
                                                                    ≈ {(item.quantity / item.sqmPerPiece).toFixed(1)} pcs
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-1 py-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={item.unitPrice}
                                                                onChange={(e) => updateFormItem(index, 'unitPrice', Number(e.target.value))}
                                                                className="w-full p-1 border border-slate-200 rounded text-right text-xs"
                                                            />
                                                        </td>
                                                        <td className="px-2 py-2 text-right font-mono font-medium text-xs">
                                                            {formatCurrency(item.lineTotal)}
                                                        </td>
                                                        <td className="px-1 py-2 text-center">
                                                            <button
                                                                onClick={() => removeFormItem(index)}
                                                                className="text-red-500 hover:text-red-700 font-bold text-lg"
                                                            >
                                                                ×
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-slate-50">
                                                <tr>
                                                    <td colSpan={3} className="px-2 py-2 text-right text-xs text-slate-500">
                                                        {formItems.reduce((sum, i) => sum + i.palettes, 0)} pal / {formItems.reduce((sum, i) => sum + i.cartons, 0)} ctn
                                                    </td>
                                                    <td className="px-2 py-2 text-center text-xs font-medium">
                                                        {formItems.reduce((sum, i) => sum + i.quantity, 0).toFixed(2)} m²
                                                    </td>
                                                    <td className="px-2 py-2 text-right text-xs font-semibold">Total:</td>
                                                    <td className="px-2 py-2 text-right font-mono font-bold text-blue-600">
                                                        {formatCurrency(formTotal)}
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}

                                {/* Notes */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                    <textarea
                                        value={formNotes}
                                        onChange={(e) => setFormNotes(e.target.value)}
                                        rows={2}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
                                <button
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleCreateReturn}
                                    disabled={isSubmitting || formItems.length === 0 || (!isManualClient && !formCustomerId) || (isManualClient && !manualClientName.trim())}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Création...' : 'Créer le Retour'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Return Detail Modal */}
                {isDetailModalOpen && selectedReturn && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">Bon de Retour</h2>
                                    <p className="text-sm text-blue-600 font-medium">{selectedReturn.returnnumber}</p>
                                </div>
                                {getStatusBadge(selectedReturn.status)}
                            </div>

                            <div className="p-4 overflow-y-auto flex-1">
                                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                    <div>
                                        <span className="text-slate-500">Client:</span>
                                        <span className="ml-2 font-medium">{selectedReturn.customername}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Date:</span>
                                        <span className="ml-2 font-medium">{formatDate(selectedReturn.returndate)}</span>
                                    </div>
                                    {selectedReturn.reason && (
                                        <div className="col-span-2">
                                            <span className="text-slate-500">Raison:</span>
                                            <span className="ml-2">{selectedReturn.reason}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Produit</th>
                                                <th className="px-3 py-2 text-center">Qté</th>
                                                <th className="px-3 py-2 text-right">Prix U.</th>
                                                <th className="px-3 py-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedReturn.items.map((item) => (
                                                <tr key={item.returnitemid}>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium">{item.productname}</div>
                                                        <div className="text-xs text-slate-500">{item.productcode}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">{item.quantity}</td>
                                                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(item.unitprice)}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-medium">{formatCurrency(item.linetotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50">
                                            <tr>
                                                <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total:</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">
                                                    {formatCurrency(selectedReturn.totalamount)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
                                <button
                                    onClick={() => setIsDetailModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
                                >
                                    Fermer
                                </button>
                                <button
                                    onClick={handlePrint}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                                >
                                    🖨️ Imprimer Bon de Retour
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hidden Print Component */}
                <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
                    <StandardDocument ref={printRef} type="RETURN_SLIP" data={getPrintData()} />
                </div>

            </div>
        </div>
    );
}

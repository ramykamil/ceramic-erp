'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface SupplierVersementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    editData?: any;
}

interface CashAccount {
    accountid: number;
    accountname: string;
    balance: number;
    isdefault: boolean;
}

interface Brand {
    brandid: number;
    brandname: string;
    currentbalance?: number;
}

export default function SupplierVersementModal({ isOpen, onClose, onSave, editData }: SupplierVersementModalProps) {
    const [accounts, setAccounts] = useState<CashAccount[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [brandSearch, setBrandSearch] = useState('');
    const [showBrandDropdown, setShowBrandDropdown] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [accountId, setAccountId] = useState<number | null>(null);
    const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
    const [amount, setAmount] = useState('');
    const [paymentMode, setPaymentMode] = useState('ESPECES');
    const [versementDate, setVersementDate] = useState(new Date().toISOString().split('T')[0]);
    const [observation, setObservation] = useState('');
    const [motif, setMotif] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadInitialData();
            if (editData) {
                setAccountId(editData.accountid);
                setAmount(String(editData.amount));
                setPaymentMode(editData.paymentmode || 'ESPECES');
                setObservation(editData.observation || '');
                setMotif(editData.motif || '');
                if (editData.suppliername) {
                    setSelectedBrand({
                        brandid: editData.referenceid,
                        brandname: editData.suppliername,
                        currentbalance: editData.supplierbalance
                    });
                }
            } else {
                resetForm();
            }
        }
    }, [isOpen, editData]);

    const loadInitialData = async () => {
        setIsLoading(true);
        try {
            const [accountsRes, brandsRes] = await Promise.all([
                api.getCashAccounts(),
                api.getBrands()
            ]);

            if (accountsRes.success) {
                setAccounts(accountsRes.data || []);
                const defaultAccount = accountsRes.data?.find((a: CashAccount) => a.isdefault);
                if (defaultAccount && !editData) {
                    setAccountId(defaultAccount.accountid);
                }
            }

            if (brandsRes.success) {
                setBrands((brandsRes.data as Brand[]) || []);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setAccountId(null);
        setSelectedBrand(null);
        setAmount('');
        setPaymentMode('ESPECES');
        setVersementDate(new Date().toISOString().split('T')[0]);
        setObservation('');
        setMotif('');
        setBrandSearch('');
    };

    const handleBrandSelect = (brand: Brand) => {
        setSelectedBrand(brand);
        setBrandSearch(brand.brandname);
        setShowBrandDropdown(false);
    };

    const filteredBrands = brands.filter(b =>
        b.brandname.toLowerCase().includes(brandSearch.toLowerCase())
    );

    const handleSubmit = async () => {
        if (!accountId) {
            alert('Veuillez sélectionner un compte');
            return;
        }
        if (!selectedBrand) {
            alert('Veuillez sélectionner une marque/fournisseur');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            alert('Veuillez entrer un montant valide');
            return;
        }

        setIsSaving(true);
        try {
            if (editData) {
                // Update existing
                const response = await api.updateCashTransaction(editData.transactionid, {
                    accountId,
                    amount: parseFloat(amount),
                    tiers: selectedBrand.brandname,
                    motif: motif || `Paiement fournisseur ${selectedBrand.brandname}`,
                    paymentMode,
                    notes: observation
                });
                if (response.success) {
                    onSave();
                } else {
                    alert('Erreur: ' + response.message);
                }
            } else {
                // Create new versement for supplier
                const response = await api.createCashTransaction({
                    accountId,
                    transactionType: 'PAIEMENT',
                    amount: parseFloat(amount),
                    tiers: selectedBrand.brandname,
                    motif: motif || `Paiement fournisseur ${selectedBrand.brandname}`,
                    referenceType: 'BRAND',
                    referenceId: selectedBrand.brandid,
                    chargeType: paymentMode,
                    notes: observation
                });
                if (response.success) {
                    onSave();
                } else {
                    alert('Erreur: ' + response.message);
                }
            }
        } catch (error: any) {
            alert('Erreur: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const formatCurrencyDZD = (amount: number) =>
        new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount || 0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                    <h2 className="text-lg font-bold">💰 Paiement Fournisseur</h2>
                    <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none">&times;</button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-4">
                    {isLoading ? (
                        <div className="text-center py-8">Chargement...</div>
                    ) : (
                        <>
                            {/* Compte */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Compte</label>
                                <select
                                    value={accountId || ''}
                                    onChange={(e) => setAccountId(Number(e.target.value))}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                                >
                                    <option value="">Sélectionner un compte...</option>
                                    {accounts.map(a => (
                                        <option key={a.accountid} value={a.accountid}>
                                            {a.accountname} {a.isdefault && '(Par défaut)'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Fournisseur/Marque */}
                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Fournisseur (Marque)
                                    <span className="ml-2 cursor-pointer" title="Rechercher">🔍</span>
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={selectedBrand ? selectedBrand.brandname : brandSearch}
                                        onChange={(e) => {
                                            setBrandSearch(e.target.value);
                                            setSelectedBrand(null);
                                            setShowBrandDropdown(true);
                                        }}
                                        onFocus={() => setShowBrandDropdown(true)}
                                        placeholder="Rechercher une marque..."
                                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>

                                {/* Brand Dropdown */}
                                {showBrandDropdown && filteredBrands.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                        {filteredBrands.slice(0, 10).map(b => (
                                            <div
                                                key={b.brandid}
                                                onClick={() => handleBrandSelect(b)}
                                                className="px-3 py-2 hover:bg-orange-50 cursor-pointer border-b border-slate-100 last:border-0"
                                            >
                                                <div className="font-medium">{b.brandname}</div>
                                                {b.currentbalance !== undefined && (
                                                    <div className="text-xs text-slate-500">
                                                        Solde: {formatCurrencyDZD(b.currentbalance)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Show supplier balance when selected */}
                                {selectedBrand && selectedBrand.currentbalance !== undefined && (
                                    <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                        <div className="text-sm text-orange-800">
                                            <strong>Solde Fournisseur:</strong> {formatCurrencyDZD(selectedBrand.currentbalance)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Date and Payment Mode */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={versementDate}
                                        onChange={(e) => setVersementDate(e.target.value)}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mode Règlement</label>
                                    <select
                                        value={paymentMode}
                                        onChange={(e) => setPaymentMode(e.target.value)}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                                    >
                                        <option value="ESPECES">Espèces</option>
                                        <option value="CHEQUE">Chèque</option>
                                        <option value="VIREMENT">Virement</option>
                                    </select>
                                </div>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Montant</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-12 focus:ring-orange-500 focus:border-orange-500 text-lg font-bold"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">DA</span>
                                </div>
                            </div>

                            {/* Motif */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Motif</label>
                                <input
                                    type="text"
                                    value={motif}
                                    onChange={(e) => setMotif(e.target.value)}
                                    placeholder="Ex: Paiement commande PO-2024-..."
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                                />
                            </div>

                            {/* Observation */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Observation</label>
                                <textarea
                                    value={observation}
                                    onChange={(e) => setObservation(e.target.value)}
                                    rows={2}
                                    placeholder="Notes ou observations..."
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 rounded-b-xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center gap-2"
                    >
                        ✕ Annuler
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving || isLoading}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? 'Enregistrement...' : '✓ Valider'}
                    </button>
                </div>
            </div>
        </div>
    );
}

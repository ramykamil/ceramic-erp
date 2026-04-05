'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface VersementModalProps {
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

interface Customer {
    customerid: number;
    customername: string;
    phone: string;
    currentbalance: number;
}

export default function VersementModal({ isOpen, onClose, onSave, editData }: VersementModalProps) {
    const [accounts, setAccounts] = useState<CashAccount[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [accountId, setAccountId] = useState<number | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [amount, setAmount] = useState('');
    const [paymentMode, setPaymentMode] = useState('ESPECES');
    const [versementDate, setVersementDate] = useState(new Date().toISOString().split('T')[0]);
    const [observation, setObservation] = useState('');
    const [motif, setMotif] = useState('');
    const [isPaid, setIsPaid] = useState(true);

    useEffect(() => {
        if (isOpen) {
            loadInitialData();
            if (editData) {
                setAccountId(editData.accountid);
                setAmount(String(editData.amount));
                setPaymentMode(editData.paymentmode || 'ESPECES');
                setObservation(editData.observation || '');
                setMotif(editData.motif || '');
                if (editData.customername) {
                    setSelectedCustomer({
                        customerid: editData.referenceid,
                        customername: editData.customername,
                        phone: editData.customerphone,
                        currentbalance: editData.customerbalance
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
            const [accountsRes, customersRes] = await Promise.all([
                api.getCashAccounts(),
                api.getCustomers({ limit: 1000 })
            ]);

            if (accountsRes.success) {
                setAccounts(accountsRes.data || []);
                // Set default account
                const defaultAccount = accountsRes.data?.find((a: CashAccount) => a.isdefault);
                if (defaultAccount && !editData) {
                    setAccountId(defaultAccount.accountid);
                }
            }

            if (customersRes.success) {
                setCustomers((customersRes.data as Customer[]) || []);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setAccountId(null);
        setSelectedCustomer(null);
        setAmount('');
        setPaymentMode('ESPECES');
        setVersementDate(new Date().toISOString().split('T')[0]);
        setObservation('');
        setMotif('');
        setIsPaid(true);
        setCustomerSearch('');
    };

    const handleCustomerSelect = (customer: Customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.customername);
        setShowCustomerDropdown(false);
    };

    const filteredCustomers = customers.filter(c =>
        c.customername.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(customerSearch))
    );

    const handleSubmit = async () => {
        if (!accountId) {
            alert('Veuillez sélectionner un compte');
            return;
        }
        if (!selectedCustomer) {
            alert('Veuillez sélectionner un client');
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
                    tiers: selectedCustomer.customername,
                    motif: motif || `Versement client ${selectedCustomer.customername}`,
                    paymentMode,
                    notes: observation
                });
                if (response.success) {
                    onSave();
                } else {
                    alert('Erreur: ' + response.message);
                }
            } else {
                // Create new versement
                const response = await api.createCashTransaction({
                    accountId,
                    transactionType: 'VERSEMENT',
                    amount: parseFloat(amount),
                    tiers: selectedCustomer.customername,
                    motif: motif || `Versement client ${selectedCustomer.customername}`,
                    referenceType: 'CLIENT',
                    referenceId: selectedCustomer.customerid,
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
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                    <h2 className="text-lg font-bold">Fiche Versement</h2>
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
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">Sélectionner un compte...</option>
                                    {accounts.map(a => (
                                        <option key={a.accountid} value={a.accountid}>
                                            {a.accountname} {a.isdefault && '(Par défaut)'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Tiers (Client) */}
                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Tiers (Client)
                                    <span className="ml-2 cursor-pointer" title="Rechercher">🔍</span>
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={selectedCustomer ? selectedCustomer.customername : customerSearch}
                                        onChange={(e) => {
                                            setCustomerSearch(e.target.value);
                                            setSelectedCustomer(null);
                                            setShowCustomerDropdown(true);
                                        }}
                                        onFocus={() => setShowCustomerDropdown(true)}
                                        placeholder="Rechercher un client..."
                                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {/* Customer Dropdown */}
                                {showCustomerDropdown && filteredCustomers.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                        {filteredCustomers.slice(0, 10).map(c => (
                                            <div
                                                key={c.customerid}
                                                onClick={() => handleCustomerSelect(c)}
                                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0"
                                            >
                                                <div className="font-medium">{c.customername}</div>
                                                <div className="text-xs text-slate-500">
                                                    {c.phone} | Solde: {formatCurrencyDZD(c.currentbalance)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Show client balance when selected */}
                                {selectedCustomer && (
                                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="text-sm text-amber-800">
                                            <strong>Ancien Solde:</strong> {formatCurrencyDZD(selectedCustomer.currentbalance)}
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
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mode Règlement</label>
                                    <select
                                        value={paymentMode}
                                        onChange={(e) => setPaymentMode(e.target.value)}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="ESPECES">Espèces</option>
                                        <option value="CHEQUE">Chèque</option>
                                        <option value="VIREMENT">Virement</option>
                                        <option value="CARTE">Carte</option>
                                    </select>
                                </div>
                            </div>

                            {/* Amount and Type */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Montant</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0,00"
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-12 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">DA</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                    <select
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                                        defaultValue="Standard"
                                    >
                                        <option value="Standard">Standard</option>
                                        <option value="Avance">Avance</option>
                                    </select>
                                </div>
                            </div>

                            {/* Paid Checkbox */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="isPaid"
                                    checked={isPaid}
                                    onChange={(e) => setIsPaid(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="isPaid" className="text-sm text-slate-700">Payé</label>
                            </div>

                            {/* Observation */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Observation</label>
                                <textarea
                                    value={observation}
                                    onChange={(e) => setObservation(e.target.value)}
                                    rows={3}
                                    placeholder="Notes ou observations..."
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
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
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? 'Enregistrement...' : '✓ Valider'}
                    </button>
                </div>
            </div>
        </div>
    );
}

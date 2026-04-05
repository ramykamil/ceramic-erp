'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSortableTable, SortDirection } from '@/hooks/useSortableTable';
import { DateQuickFilter, DateRange } from '@/components/DateQuickFilter';

// --- Interfaces ---
interface CashAccount {
    accountid: number;
    accountname: string;
    description?: string;
    balance: number;
    isdefault: boolean;
    isactive: boolean;
}

interface CashTransaction {
    transactionid: number;
    accountid: number;
    accountname: string;
    transactiontype: string;
    amount: number;
    tiers?: string;
    motif?: string;
    chargetype?: string;
    createdbyname?: string;
    createdat: string;
}

interface CashSummary {
    totalVente: number;
    totalAchat: number;
    retourVente: number;
    retourAchat: number;
    encaissement: number;
    decaissement: number;
    versements: number;
    paiement: number;
    charges: number;
    currentBalance: number;
    previousBalance: number;
    totalVenteNet: number;
    totalAchatNet: number;
    totalCharges: number;
}

interface Customer {
    customerid: number;
    customername: string;
    customertype: string;

    currentbalance: number;
}

interface Brand {
    brandid: number;
    brandname: string;
    currentbalance: number;
}

interface Factory {
    factoryid: number;
    factoryname: string;
    currentbalance: number;
}

// --- Helpers ---
const formatCurrency = (amount: number | null | undefined): string => {
    const num = Number(amount) || 0;
    return num.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DA';
};

const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-DZ');
};

const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' });
};

const getTransactionTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
        'VENTE': 'Vente',
        'ACHAT': 'Achat',
        'RETOUR_VENTE': 'Retour Vente',
        'RETOUR_ACHAT': 'Retour Achat',
        'ENCAISSEMENT': 'Encaissement',
        'DECAISSEMENT': 'Décaissement',
        'VERSEMENT': 'Versement',
        'PAIEMENT': 'Paiement',
        'CHARGE': 'Charge',
        'TRANSFERT': 'Transfert',
    };
    return labels[type] || type;
};

const isIncomeType = (type: string): boolean => {
    return ['VENTE', 'ENCAISSEMENT', 'VERSEMENT', 'RETOUR_ACHAT'].includes(type);
};

const getTransactionTypeBadge = (type: string): string => {
    const badges: Record<string, string> = {
        'VENTE': 'bg-green-100 text-green-700 border-green-200',
        'ENCAISSEMENT': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'VERSEMENT': 'bg-blue-100 text-blue-700 border-blue-200',
        'RETOUR_ACHAT': 'bg-teal-100 text-teal-700 border-teal-200',
        'ACHAT': 'bg-red-100 text-red-700 border-red-200',
        'DECAISSEMENT': 'bg-orange-100 text-orange-700 border-orange-200',
        'PAIEMENT': 'bg-purple-100 text-purple-700 border-purple-200',
        'RETOUR_VENTE': 'bg-amber-100 text-amber-700 border-amber-200',
        'CHARGE': 'bg-slate-100 text-slate-700 border-slate-200',
        'TRANSFERT': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    };
    return badges[type] || 'bg-slate-100 text-slate-600 border-slate-200';
};

// --- Add Transaction Modal ---
interface AddTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    accounts: CashAccount[];

    customers: Customer[];
    brands: Brand[];
    factories: Factory[];
}

function AddTransactionModal({ isOpen, onClose, onSave, accounts, customers, brands, factories }: AddTransactionModalProps) {
    const [accountId, setAccountId] = useState<number | ''>('');
    const [transactionType, setTransactionType] = useState('VENTE');
    const [amount, setAmount] = useState<number | ''>('');
    const [customerId, setCustomerId] = useState<number | ''>('');
    const [supplierId, setSupplierId] = useState<string>(''); // Format: "brand-1" or "factory-1"
    const [tiers, setTiers] = useState('');
    const [motif, setMotif] = useState('');
    const [chargeType, setChargeType] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            const defaultAccount = accounts.find(a => a.isdefault);
            setAccountId(defaultAccount?.accountid || (accounts[0]?.accountid || ''));
            setTransactionType('VENTE');
            setAmount('');
            setAmount('');
            setCustomerId('');
            setSupplierId('');
            setTiers('');
            setMotif('');
            setChargeType('');
            setNotes('');
            setError(null);
        }
    }, [isOpen, accounts]);

    // Auto-fill tiers when customer is selected
    useEffect(() => {
        if (customerId) {
            const customer = customers.find(c => c.customerid === customerId);
            if (customer) {
                setTiers(customer.customername);
            }
        }
    }, [customerId, customers]);

    // Auto-fill tiers when supplier is selected
    useEffect(() => {
        if (supplierId) {
            const [type, idStr] = supplierId.split('-');
            const id = Number(idStr);
            if (type === 'brand') {
                const b = brands.find(x => x.brandid === id);
                if (b) setTiers(b.brandname);
            } else if (type === 'factory') {
                const f = factories.find(x => x.factoryid === id);
                if (f) setTiers(f.factoryname);
            }
        }
    }, [supplierId, brands, factories]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accountId || !amount) {
            setError('Compte et Montant sont requis');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const response = await api.createCashTransaction({
                accountId: Number(accountId),
                transactionType,
                amount: Number(amount),
                tiers: tiers || undefined,
                motif: motif || undefined,
                chargeType: transactionType === 'CHARGE' ? chargeType : undefined,
                notes: notes || undefined,
                referenceType: customerId ? 'CLIENT' : (supplierId ? (supplierId.split('-')[0].toUpperCase()) : undefined),
                referenceId: customerId ? Number(customerId) : (supplierId ? Number(supplierId.split('-')[1]) : undefined),
            });

            if (response.success) {
                onSave();
                onClose();
            } else {
                throw new Error(response.message || 'Erreur lors de la création');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const transactionTypes = [
        { value: 'VENTE', label: 'Vente', group: 'Recettes' },
        { value: 'ENCAISSEMENT', label: 'Encaissement', group: 'Recettes' },
        { value: 'VERSEMENT', label: 'Versement Client', group: 'Recettes' },
        { value: 'RETOUR_ACHAT', label: 'Retour Achat', group: 'Recettes' },
        { value: 'ACHAT', label: 'Achat', group: 'Dépenses' },
        { value: 'DECAISSEMENT', label: 'Décaissement', group: 'Dépenses' },
        { value: 'PAIEMENT', label: 'Paiement Fournisseur', group: 'Dépenses' },
        { value: 'RETOUR_VENTE', label: 'Retour Vente', group: 'Dépenses' },
        { value: 'CHARGE', label: 'Charge', group: 'Dépenses' },
    ];

    const selectedCustomer = customers.find(c => c.customerid === customerId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
                <form onSubmit={handleSubmit}>
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h2 className="text-lg font-bold text-slate-800">Ajouter une opération</h2>
                        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                        {error && (
                            <div className="md:col-span-2 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                                <strong>Erreur:</strong> {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Compte *</label>
                            <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} required
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800">
                                {accounts.map(acc => (
                                    <option key={acc.accountid} value={acc.accountid}>{acc.accountname}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Type *</label>
                            <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)} required
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800">
                                <optgroup label="💰 Recettes">
                                    {transactionTypes.filter(t => t.group === 'Recettes').map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="💸 Dépenses">
                                    {transactionTypes.filter(t => t.group === 'Dépenses').map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Montant *</label>
                            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} required step="0.01" min="0"
                                placeholder="0.00"
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800 text-right font-mono" />
                        </div>

                        {/* Client Selection for Versement/Encaissement */}
                        {['VERSEMENT', 'ENCAISSEMENT', 'VENTE', 'RETOUR_VENTE'].includes(transactionType) && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Client</label>
                                <select value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800">
                                    <option value="">-- Sélectionner Client --</option>
                                    {customers.map(c => (
                                        <option key={c.customerid} value={c.customerid}>
                                            {c.customername} {c.currentbalance > 0 ? `(Solde: ${formatCurrency(c.currentbalance)})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {selectedCustomer && selectedCustomer.currentbalance > 0 && (
                                    <p className="mt-1 text-xs text-red-600">
                                        ⚠️ Solde impayé: {formatCurrency(selectedCustomer.currentbalance)}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Supplier Selection for Paiement/Achat */}
                        {['PAIEMENT', 'ACHAT', 'RETOUR_ACHAT'].includes(transactionType) && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fournisseur</label>
                                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800">
                                    <option value="">-- Sélectionner Fournisseur --</option>
                                    <optgroup label="Marques">
                                        {brands.map(b => (
                                            <option key={`brand-${b.brandid}`} value={`brand-${b.brandid}`}>
                                                {b.brandname} {b.currentbalance !== undefined ? `(Solde: ${formatCurrency(b.currentbalance)})` : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Usines">
                                        {factories.map(f => (
                                            <option key={`factory-${f.factoryid}`} value={`factory-${f.factoryid}`}>
                                                {f.factoryname} {f.currentbalance !== undefined ? `(Solde: ${formatCurrency(f.currentbalance)})` : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                </select>
                            </div>
                        )}

                        <div className={['VERSEMENT', 'ENCAISSEMENT', 'VENTE', 'RETOUR_VENTE'].includes(transactionType) ? '' : 'md:col-span-2'}>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tiers (Client/Fournisseur)</label>
                            <input type="text" value={tiers} onChange={(e) => setTiers(e.target.value)}
                                placeholder="Nom du client ou fournisseur"
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800" />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Motif / Référence</label>
                            <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
                                placeholder="Ex: Vente N° 1201, Versement sur compte"
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800" />
                        </div>

                        {transactionType === 'CHARGE' && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Type de Charge</label>
                                <select value={chargeType} onChange={(e) => setChargeType(e.target.value)}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800">
                                    <option value="">-- Sélectionner --</option>
                                    <option value="LOYER">Loyer</option>
                                    <option value="ELECTRICITE">Électricité</option>
                                    <option value="EAU">Eau</option>
                                    <option value="SALAIRE">Salaire</option>
                                    <option value="TRANSPORT">Transport</option>
                                    <option value="FOURNITURES">Fournitures</option>
                                    <option value="AUTRE">Autre</option>
                                </select>
                            </div>
                        )}

                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
                            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-800 resize-none" />
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={isSaving}
                            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm">
                            Annuler
                        </button>
                        <button type="submit" disabled={isSaving}
                            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2">
                            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- Account List Modal ---
interface AccountListModalProps {
    isOpen: boolean;
    onClose: () => void;
    accounts: CashAccount[];
    onRefresh: () => void;
}

function AccountListModal({ isOpen, onClose, accounts, onRefresh }: AccountListModalProps) {
    const [showNewForm, setShowNewForm] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

    const [showTransferForm, setShowTransferForm] = useState(false);
    const [transferFromId, setTransferFromId] = useState<number | ''>('');
    const [transferToId, setTransferToId] = useState<number | ''>('');
    const [transferAmount, setTransferAmount] = useState<number | ''>('');
    const [isTransferring, setIsTransferring] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setShowNewForm(false);
            setShowTransferForm(false);
            setError(null);
        }
    }, [isOpen]);

    const handleCreateAccount = async () => {
        if (!newAccountName.trim()) {
            setError('Le nom du compte est requis');
            return;
        }
        setIsCreating(true);
        setError(null);
        try {
            const response = await api.createCashAccount({
                accountName: newAccountName.trim(),
                description: newDescription.trim() || undefined,
            });
            if (response.success) {
                setNewAccountName('');
                setNewDescription('');
                setShowNewForm(false);
                onRefresh();
            } else {
                throw new Error(response.message);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleSetDefault = async (id: number) => {
        try {
            const response = await api.setDefaultCashAccount(id);
            if (response.success) {
                onRefresh();
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce compte ?')) return;
        try {
            const response = await api.deleteCashAccount(id);
            if (response.success) {
                onRefresh();
            } else {
                throw new Error(response.message);
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleTransfer = async () => {
        if (!transferFromId || !transferToId || !transferAmount) {
            setError('Tous les champs de transfert sont requis');
            return;
        }
        setIsTransferring(true);
        setError(null);
        try {
            const response = await api.createCashTransfer({
                fromAccountId: Number(transferFromId),
                toAccountId: Number(transferToId),
                amount: Number(transferAmount),
            });
            if (response.success) {
                setShowTransferForm(false);
                setTransferFromId('');
                setTransferToId('');
                setTransferAmount('');
                onRefresh();
            } else {
                throw new Error(response.message);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsTransferring(false);
        }
    };

    if (!isOpen) return null;

    const defaultAccount = accounts.find(a => a.isdefault);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800">Liste des comptes</h2>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
                </div>

                <div className="p-4 border-b border-slate-100 flex flex-wrap gap-2">
                    <button onClick={() => { if (selectedAccountId) handleSetDefault(selectedAccountId); }}
                        disabled={!selectedAccountId}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1 text-slate-700">
                        📍 Par Defaut
                    </button>
                    <button onClick={() => setShowNewForm(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1">
                        ➕ Nouveau
                    </button>
                    <button onClick={() => { if (selectedAccountId) handleDelete(selectedAccountId); }}
                        disabled={!selectedAccountId}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                        ❌ Supprimer
                    </button>
                    <button onClick={() => setShowTransferForm(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
                        ↔️ Transfert
                    </button>
                </div>

                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                {showNewForm && (
                    <div className="p-4 bg-blue-50 border-b border-blue-100">
                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nom du compte *</label>
                                <input type="text" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)}
                                    placeholder="Ex: CAISSE SECONDAIRE" className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                            </div>
                            <button onClick={handleCreateAccount} disabled={isCreating}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                                {isCreating ? '...' : 'Créer'}
                            </button>
                            <button onClick={() => setShowNewForm(false)} className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">✕</button>
                        </div>
                    </div>
                )}

                {showTransferForm && (
                    <div className="p-4 bg-purple-50 border-b border-purple-100">
                        <div className="grid grid-cols-4 gap-3 items-end">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">De *</label>
                                <select value={transferFromId} onChange={(e) => setTransferFromId(Number(e.target.value))}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                                    <option value="">--</option>
                                    {accounts.map(a => <option key={a.accountid} value={a.accountid}>{a.accountname}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Vers *</label>
                                <select value={transferToId} onChange={(e) => setTransferToId(Number(e.target.value))}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                                    <option value="">--</option>
                                    {accounts.map(a => <option key={a.accountid} value={a.accountid}>{a.accountname}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Montant *</label>
                                <input type="number" value={transferAmount} onChange={(e) => setTransferAmount(Number(e.target.value))}
                                    placeholder="0.00" step="0.01" min="0" className="w-full p-2 border border-slate-300 rounded-lg text-sm text-right font-mono" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleTransfer} disabled={isTransferring}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                                    {isTransferring ? '...' : 'Transférer'}
                                </button>
                                <button onClick={() => setShowTransferForm(false)} className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">✕</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0 border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-left w-10"></th>
                                <th className="px-4 py-3 text-left">Description</th>
                                <th className="px-4 py-3 text-right">Solde</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {accounts.map(account => (
                                <tr key={account.accountid} onClick={() => setSelectedAccountId(account.accountid)}
                                    className={`cursor-pointer hover:bg-slate-50 transition ${selectedAccountId === account.accountid ? 'bg-blue-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <input type="radio" name="selectedAccount" checked={selectedAccountId === account.accountid}
                                            onChange={() => setSelectedAccountId(account.accountid)} className="w-4 h-4 text-blue-600" />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{account.accountname}</div>
                                        {account.isdefault && <span className="text-xs text-blue-600 font-medium">★ Par défaut</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">{formatCurrency(account.balance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100">
                    <div className="text-sm text-slate-600">
                        Compte par défaut : <span className="font-semibold text-slate-800">{defaultAccount?.accountname || 'Aucun'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Main Page Component ---
export default function AccountingPage() {
    const router = useRouter();

    const [accounts, setAccounts] = useState<CashAccount[]>([]);
    const [transactions, setTransactions] = useState<CashTransaction[]>([]);

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [factories, setFactories] = useState<Factory[]>([]);
    const [summary, setSummary] = useState<CashSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState<string | null>(null);

    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [endDate, setEndDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [selectedAccountId, setSelectedAccountId] = useState<number | ''>('');
    const [selectedType, setSelectedType] = useState('');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAccountListOpen, setIsAccountListOpen] = useState(false);

    // Sorting
    const { sortedData, handleSort, getSortDirection } = useSortableTable<CashTransaction>(transactions);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (accounts.length > 0) {
            fetchTransactions();
            fetchSummary();
        }
    }, [startDate, endDate, selectedAccountId, selectedType, accounts]);

    const fetchInitialData = async () => {
        try {
            const [accountsRes, customersRes, brandsRes, factoriesRes] = await Promise.all([
                api.getCashAccounts(),
                api.getCustomers(),
                api.getBrands(),
                api.getFactories()
            ]);
            if (accountsRes.success) setAccounts(accountsRes.data || []);
            if (customersRes.success) setCustomers((customersRes.data as Customer[]) || []);
            if (brandsRes.success) setBrands((brandsRes.data as Brand[]) || []);
            if (factoriesRes.success) setFactories((factoriesRes.data as Factory[]) || []);
            if (accountsRes.message?.includes('token')) router.push('/login');
        } catch (error: any) {
            console.error('Error fetching initial data:', error);
            setApiError(error.message);
        }
    };

    const fetchTransactions = async () => {
        setIsLoading(true);
        try {
            const params: any = { startDate, endDate };
            if (selectedAccountId) params.accountId = selectedAccountId;
            if (selectedType) params.transactionType = selectedType;

            const response = await api.getCashTransactions(params);
            if (response.success) setTransactions(response.data || []);
        } catch (error: any) {
            console.error('Error fetching transactions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const params: any = { startDate, endDate };
            if (selectedAccountId) params.accountId = selectedAccountId;
            const response = await api.getCashSummary(params);
            if (response.success) setSummary(response.data);
        } catch (error: any) {
            console.error('Error fetching summary:', error);
        }
    };

    const handleRefresh = () => {
        fetchInitialData();
        fetchTransactions();
        fetchSummary();
    };

    const currentBalance = summary?.currentBalance || 0;
    const previousBalance = summary?.previousBalance || 0;

    return (
        <div className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6 text-slate-800">
            <div className="max-w-[1600px] mx-auto">

                {/* === HEADER === */}
                <div className="mb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Caisse</h1>
                        <p className="text-slate-500 text-xs mt-0.5">Gestion des transactions et comptes de caisse</p>
                    </div>

                    {/* Date Quick Filter */}
                    <DateQuickFilter
                        onFilterChange={(range: DateRange) => {
                            setStartDate(range.startDate || '');
                            setEndDate(range.endDate || '');
                        }}
                        defaultPreset="TODAY"
                    />

                    {/* Manual Date Range Filter */}
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-xs text-slate-500 font-medium">Dates</span>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                            className="bg-transparent border border-slate-200 rounded px-2 py-1 text-sm" />
                        <span className="text-slate-400">→</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                            className="bg-transparent border border-slate-200 rounded px-2 py-1 text-sm" />
                        <button onClick={handleRefresh} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Actualiser">🔄</button>
                    </div>

                    <Link href="/" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-1.5">
                        ← Retour
                    </Link>
                </div>

                {/* === BALANCE CARDS === */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                        <div className="text-xs text-slate-500 uppercase font-medium">Solde antérieur</div>
                        <div className="text-xl font-bold text-slate-700 font-mono mt-1">{formatCurrency(previousBalance)}</div>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                        <div className="text-xs text-slate-500 uppercase font-medium">Mouvement période</div>
                        <div className={`text-xl font-bold font-mono mt-1 ${(currentBalance - previousBalance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(currentBalance - previousBalance) >= 0 ? '+' : ''}{formatCurrency(currentBalance - previousBalance)}
                        </div>
                    </div>
                    <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg shadow-sm p-4">
                        <div className="text-xs text-white/80 uppercase font-medium">Solde actuel</div>
                        <div className="text-2xl font-bold text-white font-mono mt-1">{formatCurrency(currentBalance)}</div>
                    </div>
                </div>

                {/* === FILTERS & ACTIONS === */}
                <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Compte</label>
                        <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : '')}
                            className="border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-sm min-w-[150px]">
                            <option value="">Tous</option>
                            {accounts.map(acc => <option key={acc.accountid} value={acc.accountid}>{acc.accountname}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Type</label>
                        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
                            className="border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-sm min-w-[120px]">
                            <option value="">Tous</option>
                            <option value="VENTE">Vente</option>
                            <option value="VERSEMENT">Versement</option>
                            <option value="ENCAISSEMENT">Encaissement</option>
                            <option value="ACHAT">Achat</option>
                            <option value="PAIEMENT">Paiement</option>
                            <option value="DECAISSEMENT">Décaissement</option>
                            <option value="CHARGE">Charge</option>
                            <option value="RETOUR_VENTE">Retour Vente</option>
                            <option value="RETOUR_ACHAT">Retour Achat</option>
                        </select>
                    </div>

                    <div className="flex-1"></div>

                    <button onClick={() => setIsAccountListOpen(true)}
                        className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm flex items-center gap-2">
                        📋 Comptes
                    </button>

                    <button onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-lg flex items-center gap-2">
                        ➕ Ajouter opération
                    </button>

                </div>

                {/* === ERROR === */}
                {apiError && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                        <strong>Erreur:</strong> {apiError}
                    </div>
                )}

                {/* === TRANSACTIONS TABLE === */}
                <div className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm mb-4">
                    {isLoading ? (
                        <div className="text-center py-16">
                            <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500">Chargement...</p>
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">
                            <p className="text-lg">Aucune transaction pour cette période.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-700 text-white text-xs uppercase">
                                    <tr>
                                        <th className="px-3 py-2.5 text-left cursor-pointer hover:bg-slate-600 select-none" onClick={() => handleSort('tiers' as keyof CashTransaction)}>Tiers {getSortDirection('tiers' as keyof CashTransaction) === 'asc' ? '▲' : getSortDirection('tiers' as keyof CashTransaction) === 'desc' ? '▼' : '⇅'}</th>
                                        <th className="px-3 py-2.5 text-left cursor-pointer hover:bg-slate-600 select-none" onClick={() => handleSort('motif' as keyof CashTransaction)}>Motif {getSortDirection('motif' as keyof CashTransaction) === 'asc' ? '▲' : getSortDirection('motif' as keyof CashTransaction) === 'desc' ? '▼' : '⇅'}</th>
                                        <th className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-600 select-none" onClick={() => handleSort('amount' as keyof CashTransaction)}>Recette {getSortDirection('amount' as keyof CashTransaction) === 'asc' ? '▲' : getSortDirection('amount' as keyof CashTransaction) === 'desc' ? '▼' : '⇅'}</th>
                                        <th className="px-3 py-2.5 text-right">Dépenses</th>
                                        <th className="px-3 py-2.5 text-left cursor-pointer hover:bg-slate-600 select-none" onClick={() => handleSort('accountname' as keyof CashTransaction)}>Compte {getSortDirection('accountname' as keyof CashTransaction) === 'asc' ? '▲' : getSortDirection('accountname' as keyof CashTransaction) === 'desc' ? '▼' : '⇅'}</th>
                                        <th className="px-3 py-2.5 text-left cursor-pointer hover:bg-slate-600 select-none" onClick={() => handleSort('createdbyname' as keyof CashTransaction)}>Ajouté par {getSortDirection('createdbyname' as keyof CashTransaction) === 'asc' ? '▲' : getSortDirection('createdbyname' as keyof CashTransaction) === 'desc' ? '▼' : '⇅'}</th>
                                        <th className="px-3 py-2.5 text-left cursor-pointer hover:bg-slate-600 select-none" onClick={() => handleSort('createdat' as keyof CashTransaction)}>Date {getSortDirection('createdat' as keyof CashTransaction) === 'asc' ? '▲' : getSortDirection('createdat' as keyof CashTransaction) === 'desc' ? '▼' : '⇅'}</th>
                                        <th className="px-3 py-2.5 text-left">Heure</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sortedData.map((tx) => (
                                        <tr key={tx.transactionid} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-slate-800">{tx.tiers || '-'}</div>
                                                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-medium border ${getTransactionTypeBadge(tx.transactiontype)}`}>
                                                    {getTransactionTypeLabel(tx.transactiontype)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-600">{tx.motif || '-'}</td>
                                            <td className="px-3 py-2.5 text-right font-mono">
                                                {isIncomeType(tx.transactiontype) ? (
                                                    <span className="text-green-600 font-semibold">{formatCurrency(tx.amount)}</span>
                                                ) : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono">
                                                {!isIncomeType(tx.transactiontype) ? (
                                                    <span className="text-red-600 font-semibold">{formatCurrency(tx.amount)}</span>
                                                ) : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-600 text-xs">{tx.accountname}</td>
                                            <td className="px-3 py-2.5 text-slate-500 text-xs">{tx.createdbyname || '-'}</td>
                                            <td className="px-3 py-2.5 text-slate-600">{formatDate(tx.createdat)}</td>
                                            <td className="px-3 py-2.5 text-slate-500">{formatTime(tx.createdat)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* === SUMMARY FOOTER === */}
                {summary && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                        {/* Sales */}
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Ventes</div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Total Vente:</span>
                                <span className="font-mono text-green-600">{formatCurrency(summary.totalVente)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Retour Vente:</span>
                                <span className="font-mono text-red-500">{formatCurrency(summary.retourVente)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Versements:</span>
                                <span className="font-mono text-blue-600">{formatCurrency(summary.versements)}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                                <span className="font-semibold text-slate-700">TOTAL VENTE</span>
                                <span className="font-mono text-green-600 font-bold">{formatCurrency(summary.totalVenteNet)}</span>
                            </div>
                        </div>

                        {/* Purchases */}
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Achats</div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Total Achat:</span>
                                <span className="font-mono text-red-600">{formatCurrency(summary.totalAchat)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Retour Achat:</span>
                                <span className="font-mono text-green-500">{formatCurrency(summary.retourAchat)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Paiement:</span>
                                <span className="font-mono text-purple-600">{formatCurrency(summary.paiement)}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                                <span className="font-semibold text-slate-700">TOTAL ACHAT</span>
                                <span className="font-mono text-red-600 font-bold">{formatCurrency(summary.totalAchatNet)}</span>
                            </div>
                        </div>

                        {/* Charges */}
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Charges</div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Charges:</span>
                                <span className="font-mono text-orange-600">{formatCurrency(summary.charges)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Encaissement:</span>
                                <span className="font-mono text-emerald-600">{formatCurrency(summary.encaissement)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Décaissement:</span>
                                <span className="font-mono text-red-500">{formatCurrency(summary.decaissement)}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                                <span className="font-semibold text-slate-700">TOTAL CHARGE</span>
                                <span className="font-mono text-orange-600 font-bold">{formatCurrency(summary.totalCharges)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modals */}
                <AddTransactionModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onSave={handleRefresh}
                    accounts={accounts}
                    customers={customers}
                    brands={brands}
                    factories={factories}
                />

                <AccountListModal
                    isOpen={isAccountListOpen}
                    onClose={() => setIsAccountListOpen(false)}
                    accounts={accounts}
                    onRefresh={handleRefresh}
                />
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface User {
    userid: number;
    username: string;
    role: string;
    email: string;
    isactive: boolean;
    createdat: string;
    lastlogin?: string;
    permissions?: string[];
}

const AVAILABLE_PERMISSIONS = [
    { key: 'sales_pos', label: 'Point de Vente' },
    { key: 'orders', label: 'Commandes' },
    { key: 'customers', label: 'Clients' },
    { key: 'inventory', label: 'Stock & Inventaire' },
    { key: 'products', label: 'Catalogue Produits' },
    { key: 'purchasing', label: 'Achats' },
    { key: 'logistics', label: 'Logistique' },
    { key: 'accounting', label: 'Comptabilité' },
    { key: 'reports', label: 'Rapports' },
    { key: 'brands', label: 'Marques' },
    { key: 'hr', label: 'Ressources Humaines' },
    { key: 'settings', label: 'Paramètres' },
];

interface Session {
    sessionid: number;
    userid: number;
    username: string;
    role: string;
    ipaddress: string;
    useragent: string;
    logintime: string;
    lastactive: string;
}

type TabType = 'SOCIETE' | 'IMPRESSION' | 'PARAMETRAGE' | 'SAUVEGARDE' | 'UTILISATEURS' | 'SESSIONS' | 'HISTORIQUE';

const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SALES_RETAIL', 'SALES_WHOLESALE', 'WAREHOUSE'];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('SOCIETE');
    const [formData, setFormData] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Users state
    const [users, setUsers] = useState<User[]>([]);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userForm, setUserForm] = useState<{
        username: string;
        password: string;
        role: string;
        email: string;
        isactive: boolean;
        permissions: string[];
    }>({ username: '', password: '', role: 'SALES_RETAIL', email: '', isactive: true, permissions: [] });

    const [sessions, setSessions] = useState<Session[]>([]);

    // Audit Logs State
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [auditPage, setAuditPage] = useState(1);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditLoading, setAuditLoading] = useState(false);

    // Load Settings
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await api.getSettings();
            if (res.success) setFormData(res.data || {});
        } catch (e) {
            console.error('Error loading settings:', e);
        } finally {
            setLoading(false);
        }
    };

    const loadUsers = async () => {
        try {
            const response = await api.getUsers();
            if (response.success && response.data) {
                setUsers(response.data);
            }
        } catch (e) {
            console.error('Error loading users:', e);
        }
    };

    const loadSessions = async () => {
        try {
            const response = await api.getActiveSessions();
            if (response.success && response.data) {
                setSessions(response.data);
            }
        } catch (e) {
            console.error('Error loading sessions:', e);
        }
    };

    useEffect(() => {
        if (activeTab === 'UTILISATEURS') {
            loadUsers();
        } else if (activeTab === 'SESSIONS') {
            loadSessions();
        } else if (activeTab === 'HISTORIQUE') {
            loadAuditLogs();
        }
    }, [activeTab, auditPage]);

    const loadAuditLogs = async () => {
        setAuditLoading(true);
        try {
            const res = await api.getAuditLogs(auditPage);
            if (res && res.data) {
                // Backend returns { success: true, data: [...], total: ... }
                // So res.data IS the array. cast res to any to access 'total' which is a sibling.
                setAuditLogs((res.data as unknown as any[]) || []);
                setAuditTotal((res as any).total || 0);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAuditLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const target = e.target;
        const { name, value, type } = target;
        const checked = (target as HTMLInputElement).checked;
        setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.updateSettings(formData);
            alert("✅ Paramètres enregistrés avec succès!");
        } catch (e) {
            alert("❌ Erreur lors de la sauvegarde");
        } finally {
            setSaving(false);
        }
    };

    const handleBackup = async () => {
        try {
            const res = await api.createBackup();
            if (res.success) {
                alert(`✅ ${res.message}`);
            }
        } catch (e) {
            alert("❌ Erreur lors de la sauvegarde");
        }
    };

    // User management functions
    const openUserModal = (user?: User) => {
        if (user) {
            setEditingUser(user);
            setUserForm({
                username: user.username,
                password: '',
                role: user.role,
                email: user.email || '',
                isactive: user.isactive,
                permissions: user.permissions || []
            });
        } else {
            setEditingUser(null);
            setUserForm({ username: '', password: '', role: 'SALES_RETAIL', email: '', isactive: true, permissions: [] });
        }
        setShowUserModal(true);
    };

    const saveUser = async () => {
        try {
            if (editingUser) {
                await api.updateUser(editingUser.userid, userForm);
            } else {
                if (!userForm.password) {
                    alert("Le mot de passe est requis pour un nouvel utilisateur");
                    return;
                }
                await api.createUser(userForm);
            }
            setShowUserModal(false);
            loadUsers();
            alert("✅ Utilisateur enregistré");
        } catch (e) {
            alert("❌ Erreur lors de l'enregistrement");
        }
    };

    const deleteUser = async (userId: number) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur?")) return;
        try {
            await api.deleteUser(userId);
            loadUsers();
            alert("✅ Utilisateur supprimé");
        } catch (e) {
            alert("❌ Erreur lors de la suppression");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-500">Chargement des paramètres...</p>
                </div>
            </div>
        );
    }

    const tabs: { key: TabType; label: string; icon: string }[] = [
        { key: 'SOCIETE', label: 'Société', icon: '🏢' },
        { key: 'IMPRESSION', label: 'Impression', icon: '🖨️' },
        { key: 'PARAMETRAGE', label: 'Paramétrage', icon: '⚙️' },
        { key: 'SAUVEGARDE', label: 'Sauvegarde', icon: '💾' },
        { key: 'UTILISATEURS', label: 'Utilisateurs', icon: '👥' },
        { key: 'SESSIONS', label: 'Appareils Connectés', icon: '📱' },
        { key: 'HISTORIQUE', label: 'Historique', icon: '📜' },
    ];

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800">

            {/* HEADER */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/"
                                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                </svg>
                                Retour
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">⚙️ Paramètres</h1>
                                <p className="text-sm text-slate-500">Configuration de l'application</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg shadow font-bold flex items-center gap-2 disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Enregistrement...
                                </>
                            ) : (
                                <>
                                    <span>💾</span> Enregistrer (F10)
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* TABS */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex gap-1 pt-2 overflow-x-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-5 py-3 rounded-t-lg font-medium text-sm whitespace-nowrap transition ${activeTab === tab.key
                                    ? 'bg-slate-50 text-blue-700 border-t-2 border-x border-blue-500 border-slate-200 -mb-px font-bold'
                                    : 'bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                    }`}
                            >
                                <span className="mr-2">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* CONTENT */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* TAB 1: SOCIETE */}
                {activeTab === 'SOCIETE' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold mb-6 pb-2 border-b border-slate-100">🏢 Informations de la Société</h2>
                        <div className="max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-slate-700 mb-1">Raison Sociale</label>
                                <input name="companyname" value={formData.companyname || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg bg-blue-50 font-bold text-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-slate-700 mb-1">Activité</label>
                                <input name="activity" value={formData.activity || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-slate-700 mb-1">Adresse</label>
                                <textarea name="address" value={formData.address || ''} onChange={handleChange} rows={2}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Téléphone 1</label>
                                <input name="phone1" value={formData.phone1 || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Téléphone 2</label>
                                <input name="phone2" value={formData.phone2 || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                                <input name="email" type="email" value={formData.email || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">N° RC</label>
                                <input name="rc" value={formData.rc || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">NIF</label>
                                <input name="nif" value={formData.nif || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">AI</label>
                                <input name="ai" value={formData.ai || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">NIS</label>
                                <input name="nis" value={formData.nis || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">RIB</label>
                                <input name="rib" value={formData.rib || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Capital</label>
                                <input name="capital" value={formData.capital || ''} onChange={handleChange}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: IMPRESSION */}
                {activeTab === 'IMPRESSION' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="font-bold text-lg mb-4 pb-2 border-b border-slate-100">🖨️ Format par Défaut</h3>
                            <div className="flex gap-6">
                                <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-slate-50">
                                    <input type="radio" name="defaultprintformat" value="A4"
                                        checked={formData.defaultprintformat === 'A4'} onChange={handleChange}
                                        className="w-5 h-5 text-blue-600" />
                                    <span className="font-medium">📄 A4 Standard</span>
                                </label>
                                <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-slate-50">
                                    <input type="radio" name="defaultprintformat" value="TICKET"
                                        checked={formData.defaultprintformat === 'TICKET' || !formData.defaultprintformat} onChange={handleChange}
                                        className="w-5 h-5 text-blue-600" />
                                    <span className="font-medium">🧾 Ticket de Caisse</span>
                                </label>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="font-bold text-lg mb-4 pb-2 border-b border-slate-100">🧾 Personnalisation Ticket</h3>
                            <div className="max-w-xl space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Largeur Ticket</label>
                                    <select name="ticketwidth" value={formData.ticketwidth || '80mm'} onChange={handleChange}
                                        className="w-40 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                        <option value="80mm">80mm</option>
                                        <option value="58mm">58mm</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">En-tête (Header)</label>
                                    <input name="ticketheader" value={formData.ticketheader || ''} onChange={handleChange}
                                        placeholder="Bienvenue chez ALLAOUA CERAM"
                                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Pied de page (Footer)</label>
                                    <input name="ticketfooter" value={formData.ticketfooter || ''} onChange={handleChange}
                                        placeholder="Merci pour votre confiance!"
                                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" name="showbalanceonticket"
                                            checked={formData.showbalanceonticket || false} onChange={handleChange}
                                            className="w-5 h-5 text-blue-600 rounded" />
                                        <span className="font-medium">Afficher le solde client sur le ticket</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: PARAMETRAGE */}
                {activeTab === 'PARAMETRAGE' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold mb-6 pb-2 border-b border-slate-100">⚙️ Paramètres Généraux</h2>
                        <div className="max-w-xl space-y-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
                                <div>
                                    <span className="font-medium">Mettre à jour le Prix Achat automatiquement</span>
                                    <p className="text-xs text-slate-500">Lors de la réception des marchandises</p>
                                </div>
                                <input type="checkbox" name="updatepurchaseprice"
                                    checked={formData.updatepurchaseprice || false} onChange={handleChange}
                                    className="w-6 h-6 text-blue-600 rounded" />
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
                                <div>
                                    <span className="font-medium">Activer la gestion par palette / colis</span>
                                    <p className="text-xs text-slate-500">Afficher les colonnes palettes/cartons dans POS</p>
                                </div>
                                <input type="checkbox" name="enablepalletmanagement"
                                    checked={formData.enablepalletmanagement !== false} onChange={handleChange}
                                    className="w-6 h-6 text-blue-600 rounded" />
                            </div>
                            <div className="p-4 border rounded-lg bg-slate-50">
                                <label className="block font-medium mb-2">Préfixe Code Barre</label>
                                <input name="barcodeprefix" value={formData.barcodeprefix || '20'} onChange={handleChange}
                                    className="w-24 p-3 border border-slate-300 rounded-lg text-center font-mono text-lg" />
                            </div>
                            <div className="p-4 border rounded-lg bg-slate-50">
                                <label className="block font-medium mb-2">Taux TVA par défaut (%)</label>
                                <input type="number" name="defaulttaxrate" value={formData.defaulttaxrate || 19} onChange={handleChange}
                                    className="w-24 p-3 border border-slate-300 rounded-lg text-center font-mono text-lg" />
                            </div>
                            <div className="p-4 border rounded-lg bg-slate-50">
                                <label className="block font-medium mb-2">Timbre fiscal par défaut (DA)</label>
                                <input type="number" name="defaulttimbre" value={formData.defaulttimbre || 0} onChange={handleChange}
                                    className="w-32 p-3 border border-slate-300 rounded-lg text-center font-mono text-lg" />
                            </div>
                        </div>

                        {/* MARGIN SETTINGS SECTION */}
                        <div className="mt-8 pt-6 border-t border-slate-200">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span className="text-2xl">💰</span>
                                Marges Commerciales
                            </h3>
                            <p className="text-sm text-slate-500 mb-4">
                                Définissez les marges appliquées sur le prix d'achat pour calculer automatiquement le prix de vente.
                                <br />
                                <span className="font-medium">Formule: Prix de Vente = Prix d'Achat × (1 + Marge%)</span>
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-xl">
                                <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                                    <label className="block font-medium mb-2 text-green-800">
                                        🏪 Marge Détail (%)
                                    </label>
                                    <div className="flex items-center gap-2 mb-2">
                                        <select
                                            name="retailmargintype"
                                            value={formData.retailmargintype || 'PERCENT'}
                                            onChange={handleChange}
                                            className="text-xs p-1 border border-green-300 rounded text-green-700 font-bold bg-green-50"
                                        >
                                            <option value="PERCENT">% (Pourcentage)</option>
                                            <option value="AMOUNT">DA (Montant Fixe)</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            name="retailmargin"
                                            value={formData.retailmargin || 0}
                                            onChange={handleChange}
                                            step={formData.retailmargintype === 'AMOUNT' ? "10" : "0.5"}
                                            min="0"
                                            className="w-24 p-3 border border-green-300 rounded-lg text-center font-mono text-lg font-bold text-green-800 focus:ring-2 focus:ring-green-500"
                                        />
                                        <span className="text-xl text-green-700 font-bold">
                                            {formData.retailmargintype === 'AMOUNT' ? 'DA' : '%'}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
                                    <label className="block font-medium mb-2 text-blue-800">
                                        🏭 Marge Gros
                                    </label>
                                    <p className="text-xs text-blue-600 mb-2">Appliquée aux ventes WHOLESALE</p>
                                    <div className="flex items-center gap-2 mb-2">
                                        <select
                                            name="wholesalemargintype"
                                            value={formData.wholesalemargintype || 'PERCENT'}
                                            onChange={handleChange}
                                            className="text-xs p-1 border border-blue-300 rounded text-blue-700 font-bold bg-blue-50"
                                        >
                                            <option value="PERCENT">% (Pourcentage)</option>
                                            <option value="AMOUNT">DA (Montant Fixe)</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            name="wholesalemargin"
                                            value={formData.wholesalemargin || 0}
                                            onChange={handleChange}
                                            step={formData.wholesalemargintype === 'AMOUNT' ? "10" : "0.5"}
                                            min="0"
                                            className="w-24 p-3 border border-blue-300 rounded-lg text-center font-mono text-lg font-bold text-blue-800 focus:ring-2 focus:ring-blue-500"
                                        />
                                        <span className="text-xl text-blue-700 font-bold">
                                            {formData.wholesalemargintype === 'AMOUNT' ? 'DA' : '%'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                <strong>💡 Exemple:</strong> Avec une marge de 15%, un produit acheté à 1000 DA sera vendu à 1150 DA.
                            </div>
                        </div>

                        {/* ACCESS CONTROL SECTION */}
                        <div className="mt-8 pt-6 border-t border-slate-200">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span className="text-2xl">🔒</span>
                                Contrôle d'Accès & Sécurité
                            </h3>
                            <p className="text-sm text-slate-500 mb-4">
                                Restreindre l'accès à l'application pour certains rôles utilisateurs. Les Administrateurs et Managers ne sont pas affectés.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mb-6">
                                <div className="p-4 border rounded-lg bg-orange-50 border-orange-200">
                                    <label className="block font-medium mb-2 text-orange-800">
                                        🕒 Heures de Travail
                                    </label>
                                    <p className="text-xs text-orange-600 mb-3">Bloquer l'accès en dehors de ces horaires</p>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <span className="text-xs text-orange-700 block mb-1">Ouverture</span>
                                            <input
                                                type="time"
                                                name="workstarttime"
                                                value={formData.workstarttime || '08:00'}
                                                onChange={handleChange}
                                                className="w-full p-2 border border-orange-300 rounded font-mono text-center focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-xs text-orange-700 block mb-1">Fermeture</span>
                                            <input
                                                type="time"
                                                name="workendtime"
                                                value={formData.workendtime || '18:00'}
                                                onChange={handleChange}
                                                className="w-full p-2 border border-orange-300 rounded font-mono text-center focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 border rounded-lg bg-red-50 border-red-200">
                                    <label className="block font-medium mb-2 text-red-800">
                                        🛡️ IPs Autorisées (Whitelisting)
                                    </label>
                                    <p className="text-xs text-red-600 mb-3">IPs séparées par des virgules (,). Si vide, l'accès est autorisé depuis n'importe où.</p>
                                    <input
                                        type="text"
                                        name="allowedips"
                                        value={formData.allowedips || ''}
                                        onChange={handleChange}
                                        placeholder="ex: 192.168.1.1, 41.100.22.40"
                                        className="w-full p-2 border border-red-300 rounded font-mono text-sm focus:ring-2 focus:ring-red-500"
                                    />
                                    <p className="mt-2 text-[10px] text-red-500 font-bold">⚠️ Attention: Restreindre les IPs bloquera les utilisateurs qui ne sont pas sur ce réseau.</p>
                                </div>
                            </div>
                        </div>

                        {/* MOBILE ACCESS SECTION */}
                        <div className="mt-8 pt-6 border-t border-slate-200">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span className="text-2xl">📱</span>
                                Accès Mobile
                            </h3>
                            <p className="text-sm text-slate-500 mb-4">
                                Utilisez cette adresse pour accéder à l'application depuis votre téléphone ou tablette.
                                <br />
                                <span className="font-medium text-amber-600">⚠️ Assurez-vous d'être connecté au même réseau WiFi.</span>
                            </p>
                            <div className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                                <label className="block font-medium mb-2 text-blue-800">
                                    🌐 Adresse Réseau Local
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="text"
                                        readOnly
                                        value="http://192.168.0.214:3000"
                                        className="flex-1 p-3 border border-blue-300 rounded-lg font-mono text-lg font-bold text-blue-800 bg-white select-all"
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText('http://192.168.0.214:3000');
                                            alert('✅ Adresse copiée!');
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium flex items-center gap-2 transition"
                                    >
                                        📋 Copier
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    💡 Ouvrez cette adresse dans Chrome ou Safari sur votre téléphone
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 4: SAUVEGARDE */}
                {activeTab === 'SAUVEGARDE' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold mb-6 pb-2 border-b border-slate-100">💾 Sauvegarde de la Base de Données</h2>
                        <div className="flex flex-col items-center justify-center py-12 space-y-6">
                            <div className="text-6xl">🗄️</div>
                            <p className="text-slate-500 text-center max-w-md">
                                Créez une sauvegarde manuelle de toutes les données de l'application.
                                Il est recommandé de sauvegarder régulièrement.
                            </p>
                            <button
                                onClick={handleBackup}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-xl text-lg font-bold shadow-lg flex items-center gap-3 transition"
                            >
                                💾 Créer une Sauvegarde
                            </button>
                            <p className="text-xs text-slate-400">
                                La sauvegarde sera enregistrée sur le serveur
                            </p>
                        </div>
                    </div>
                )}

                {/* TAB 5: UTILISATEURS */}
                {activeTab === 'UTILISATEURS' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center p-4 border-b border-slate-100">
                            <h2 className="text-lg font-semibold">👥 Gestion des Utilisateurs</h2>
                            <button
                                onClick={() => openUserModal()}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2"
                            >
                                <span>+</span> Nouvel Utilisateur
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Utilisateur</th>
                                        <th className="px-4 py-3 text-left">Email</th>
                                        <th className="px-4 py-3 text-center">Rôle</th>
                                        <th className="px-4 py-3 text-center">Statut</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {users.map(user => (
                                        <tr key={user.userid} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium">{user.username}</td>
                                            <td className="px-4 py-3 text-slate-600">{user.email || '-'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${user.role === 'ADMIN' ? 'bg-red-100 text-red-700' :
                                                    user.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-slate-100 text-slate-700'
                                                    }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${user.isactive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                                                    }`}>
                                                    {user.isactive ? 'Actif' : 'Inactif'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => openUserModal(user)}
                                                    className="text-blue-600 hover:text-blue-800 font-medium mr-3"
                                                >
                                                    Modifier
                                                </button>
                                                <button
                                                    onClick={() => deleteUser(user.userid)}
                                                    className="text-red-600 hover:text-red-800 font-medium"
                                                >
                                                    Supprimer
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB 6: SESSIONS */}
                {activeTab === 'SESSIONS' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="p-4 border-b border-slate-100">
                            <h2 className="text-lg font-semibold">📱 Appareils Connectés (30 derniers jours)</h2>
                            <p className="text-sm text-slate-500">Liste des connexions récentes au système</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Utilisateur</th>
                                        <th className="px-4 py-3 text-left">Rôle</th>
                                        <th className="px-4 py-3 text-left">IP Address</th>
                                        <th className="px-4 py-3 text-left">Appareil / Navigateur</th>
                                        <th className="px-4 py-3 text-left">Connexion</th>
                                        <th className="px-4 py-3 text-left">Dernière Activité</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sessions.map(session => (
                                        <tr key={session.sessionid} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-slate-900">{session.username}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${session.role === 'ADMIN' ? 'bg-red-100 text-red-800' :
                                                    session.role === 'MANAGER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                    {session.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-600 bg-slate-50 rounded w-fit">{session.ipaddress}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate" title={session.useragent}>
                                                {session.useragent && session.useragent.length > 50 ? session.useragent.substring(0, 50) + '...' : session.useragent}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                                {new Date(session.logintime).toLocaleString('fr-FR')}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                                {new Date(session.lastactive).toLocaleString('fr-FR')}
                                            </td>
                                        </tr>
                                    ))}
                                    {sessions.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                                                Aucune session active trouvée
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}


                {/* TAB 7: HISTORIQUE */}
                {activeTab === 'HISTORIQUE' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-semibold">📜 Historique des Actions</h2>
                                <p className="text-sm text-slate-500">Journal d'audit des modifications</p>
                            </div>
                            <div className="flex gap-2">
                                <button disabled={auditPage === 1} onClick={() => setAuditPage(p => Math.max(1, p - 1))} className="px-3 py-1 border rounded hover:bg-slate-50 disabled:opacity-50">Prev</button>
                                <span className="px-2 py-1 text-sm text-slate-600">Page {auditPage}</span>
                                <button onClick={() => setAuditPage(p => p + 1)} className="px-3 py-1 border rounded hover:bg-slate-50">Next</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b">
                                    <tr className="text-slate-500">
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Utilisateur</th>
                                        <th className="px-4 py-3 text-left">Action</th>
                                        <th className="px-4 py-3 text-left">Entité / ID</th>
                                        <th className="px-4 py-3 text-left">Détails</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {auditLoading ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-slate-500">Chargement...</td></tr>
                                    ) : auditLogs.map((log: any) => (
                                        <tr key={log.auditid} className="hover:bg-slate-50 text-sm transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                                                {new Date(log.createdat).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-700">
                                                {log.username || 'Système'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold border ${log.action.includes('SALE') ? 'bg-green-50 text-green-700 border-green-200' :
                                                    log.action.includes('PURCHASE') && !log.action.includes('DELETE') ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                                    log.action.includes('DELETE') ? 'bg-red-50 text-red-700 border-red-200' :
                                                        log.action.includes('UPDATE') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                            log.action === 'LOGIN' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                'bg-blue-50 text-blue-700 border-blue-200'
                                                    }`}>
                                                    {(() => {
                                                        const map: any = {
                                                            'SALE_PARTIAL': '💰 Vente (Acompte)',
                                                            'SALE_COMPLETED': '✅ Vente (Payée)',
                                                            'CREATE_ORDER': '📝 Nouvelle Commande',
                                                            'UPDATE_ORDER': '🔄 Modif. Commande',
                                                            'UPDATE_ORDER_STATUS': '🚚 Statut Changé',
                                                            'CREATE_PURCHASE': '🛒 Nouvel Achat',
                                                            'UPDATE_PURCHASE': '🔄 Modif. Achat',
                                                            'DELETE_PURCHASE': '🗑️ Suppr. Achat',
                                                            'CREATE_CUSTOMER': '👤 Nouveau Client',
                                                            'UPDATE_CUSTOMER': '✏️ Modif. Client',
                                                            'LOGIN': '🔑 Connexion',
                                                            'LOGOUT': '👋 Déconnexion',
                                                            'CREATE_PRODUCT': '📦 Nouveau Produit',
                                                            'UPDATE_PRODUCT': '✏️ Modif. Produit'
                                                        };
                                                        return map[log.action] || log.action;
                                                    })()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {(() => {
                                                    const tableMap: any = { 'Orders': 'Commande', 'Customers': 'Client', 'Products': 'Produit', 'Users': 'Utilisateur', 'Inventory': 'Stock', 'PurchaseOrders': 'Achat' };
                                                    return `${tableMap[log.tablename] || log.tablename} #${log.recordid}`;
                                                })()}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">
                                                {(() => {
                                                    if (!log.newvalues) return '-';
                                                    const v = log.newvalues;
                                                    // Sales / Orders
                                                    if (log.action.includes('SALE')) return `Total: ${v.totalamount} DA | Payé: ${v.paymentAmount || v.payment || 0} DA`;
                                                    if (log.action === 'CREATE_ORDER') return `Client: ${v.retailClientName || v.customername || 'Client'} | ${v.totalamount || 0} DA`;
                                                    if (log.action === 'CREATE_PURCHASE') return `📦 ${v.poNumber || ''} | Fournisseur: ${v.supplierName || '-'} | ${v.totalAmount || 0} DA | ${v.itemCount || 0} articles`;
                                                    if (log.action === 'DELETE_PURCHASE') return `Supprimé`;

                                                    // Customers
                                                    if (log.action === 'UPDATE_CUSTOMER') {
                                                        const parts = [];
                                                        if (v.currentbalance) parts.push(`Solde: ${v.currentbalance} DA`);
                                                        if (v.phone) parts.push(`Tél: ${v.phone}`);
                                                        return parts.length > 0 ? parts.join(' | ') : 'Mise à jour info';
                                                    }
                                                    if (log.action === 'CREATE_CUSTOMER') return `Tél: ${v.phone || '-'} | Solde Init: ${v.currentbalance || 0} DA`;

                                                    // Logic
                                                    if (log.action === 'LOGIN') return log.ipaddress ? `IP: ${log.ipaddress}` : 'Session web';

                                                    // Default: clean JSON
                                                    const jsonStr = JSON.stringify(v);
                                                    return jsonStr.length > 60 ? jsonStr.substring(0, 60) + '...' : jsonStr;
                                                })()}
                                            </td>
                                        </tr>
                                    ))}
                                    {!auditLoading && auditLogs.length === 0 && (
                                        <tr><td colSpan={5} className="p-8 text-center text-slate-400">Aucun historique disponible</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* User Modal */}
            {
                showUserModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                                <h3 className="font-bold text-xl text-slate-800">{editingUser ? 'Modifier Utilisateur' : 'Nouvel Utilisateur'}</h3>
                                <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600 text-3xl font-light">&times;</button>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">Nom d'utilisateur</label>
                                            <input
                                                value={userForm.username}
                                                onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                                                placeholder="Nom d'utilisateur..."
                                            />
                                            {editingUser && (
                                                <p className="text-xs text-amber-600 mt-1">
                                                    ⚠️ Attention: Changer le nom d'utilisateur peut affecter les sessions actives.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                                Mot de passe {editingUser && <span className="text-slate-400 font-normal text-xs ml-1">(laisser vide pour ne pas changer)</span>}
                                            </label>
                                            <input
                                                type="password"
                                                value={userForm.password}
                                                onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                                placeholder={editingUser ? "Modifier le mot de passe..." : "Définir un mot de passe..."}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                                            <input
                                                type="email"
                                                value={userForm.email}
                                                onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                                placeholder="exemple@email.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">Rôle</label>
                                            <select
                                                value={userForm.role}
                                                onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                                            >
                                                {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 mb-6">
                                    <input
                                        type="checkbox"
                                        id="isactive"
                                        checked={userForm.isactive}
                                        onChange={e => setUserForm({ ...userForm, isactive: e.target.checked })}
                                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                    />
                                    <label htmlFor="isactive" className="font-medium text-slate-700 cursor-pointer select-none">Utilisateur actif (peut se connecter)</label>
                                </div>

                                <div className="border-t border-slate-100 pt-6">
                                    <div className="flex justify-between items-end mb-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-800 mb-1">Permissions Spécifiques</label>
                                            <p className="text-xs text-slate-500">Cochez pour autoriser l'accès. Si tout est décoché, les permissions par défaut du rôle s'appliquent.</p>
                                        </div>
                                        <div className="flex gap-2 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setUserForm({ ...userForm, permissions: AVAILABLE_PERMISSIONS.map(p => p.key) })}
                                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                                            >
                                                Tout cocher
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setUserForm({ ...userForm, permissions: [] })}
                                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                                            >
                                                Tout décocher
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 max-h-60 overflow-y-auto">
                                        {AVAILABLE_PERMISSIONS.map(perm => (
                                            <label key={perm.key} className={`flex items-center gap-2.5 text-sm p-2 rounded-lg cursor-pointer transition-all border ${userForm.permissions.includes(perm.key) ? 'bg-white border-blue-200 shadow-sm' : 'hover:bg-white border-transparent'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={userForm.permissions.includes(perm.key)}
                                                    onChange={e => {
                                                        const newPerms = e.target.checked
                                                            ? [...userForm.permissions, perm.key]
                                                            : userForm.permissions.filter(p => p !== perm.key);
                                                        setUserForm({ ...userForm, permissions: newPerms });
                                                    }}
                                                    className="w-4.5 h-4.5 text-blue-600 rounded focus:ring-blue-500 border-slate-300 cursor-pointer"
                                                />
                                                <span className={userForm.permissions.includes(perm.key) ? 'font-medium text-slate-900' : 'text-slate-600 '}>{perm.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white rounded-b-xl">
                                <button onClick={() => setShowUserModal(false)} className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors">
                                    Annuler
                                </button>
                                <button onClick={saveUser} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                                    <span>Enregistrer</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

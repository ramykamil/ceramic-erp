'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

// Define types
interface NavButtonProps {
  href: string;
  title: string;
  description: string;
  icon: string;
  colorClass: string;
  allowedRoles: string[];
  permissionKey: string;
}

interface DashboardSection {
  title: string;
  items: NavButtonProps[];
}

// Configuration des Sections et Boutons - Français
const dashboardConfig: DashboardSection[] = [
  {
    title: "Activités Commerciales",
    items: [
      {
        href: "/sales/pos", title: "Point de Vente", description: "Saisir une nouvelle vente", icon: "🛒",
        colorClass: "from-sky-500/20 to-sky-600/10 text-sky-400",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE'],
        permissionKey: 'sales_pos'
      },
      {
        href: "/orders", title: "Commandes", description: "Suivi des ventes et statuts", icon: "📋",
        colorClass: "from-slate-500/20 to-slate-600/10 text-slate-300",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE'],
        permissionKey: 'orders'
      },
      {
        href: "/customers", title: "Clients", description: "Base client et tarifs", icon: "👥",
        colorClass: "from-violet-500/20 to-violet-600/10 text-violet-400",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_WHOLESALE'],
        permissionKey: 'customers'
      },
    ]
  },
  {
    title: "Logistique & Stock",
    items: [
      {
        href: "/inventory", title: "Stock Actuel", description: "Niveaux et ajustements", icon: "📦",
        colorClass: "from-emerald-500/20 to-emerald-600/10 text-emerald-400",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE', 'WAREHOUSE'],
        permissionKey: 'inventory'
      },
      {
        href: "/products", title: "Catalogue", description: "Produits et prix de base", icon: "📚",
        colorClass: "from-amber-500/20 to-amber-600/10 text-amber-400",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE'],
        permissionKey: 'products'
      },
      {
        href: "/purchasing", title: "Achats", description: "Commandes fournisseurs", icon: "🚚",
        colorClass: "from-sky-500/20 to-sky-600/10 text-sky-400",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_WHOLESALE', 'WAREHOUSE'],
        permissionKey: 'purchasing'
      },
      {
        href: "/logistics", title: "Livraisons", description: "Livraisons, chauffeurs et véhicules", icon: "🚛",
        colorClass: "from-teal-500/20 to-teal-600/10 text-teal-400",
        allowedRoles: ['ADMIN', 'MANAGER', 'WAREHOUSE'],
        permissionKey: 'logistics'
      },
    ]
  },
  {
    title: "Gestion & Administration",
    items: [
      {
        href: "/accounting", title: "Comptabilité", description: "Suivi financier", icon: "💰",
        colorClass: "from-emerald-500/20 to-emerald-600/10 text-emerald-400",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'accounting'
      },
      {
        href: "/reports", title: "Rapports", description: "Statistiques et KPIs", icon: "📊",
        colorClass: "from-indigo-500/20 to-indigo-600/10 text-indigo-400",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'reports'
      },
      {
        href: "/analytics", title: "Analyses & WhatsApp", description: "Prévisions et notifications", icon: "📈",
        colorClass: "from-sky-500/20 to-teal-500/10 text-sky-400",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'reports'
      },
      {
        href: "/brands", title: "Marques", description: "Configuration des marques", icon: "🏷️",
        colorClass: "from-blue-500/20 to-blue-600/10 text-blue-400",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'brands'
      },
      {
        href: "/settings", title: "Paramètres", description: "Configuration de l'application", icon: "⚙️",
        colorClass: "from-slate-500/20 to-slate-600/10 text-slate-300",
        allowedRoles: ['ADMIN'],
        permissionKey: 'settings'
      },
    ]
  },
  {
    title: "Ressources Humaines",
    items: [
      {
        href: "/hr/employees", title: "Employés", description: "Gestion du personnel", icon: "👨‍💼",
        colorClass: "from-rose-500/20 to-rose-600/10 text-rose-400",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'hr'
      },
      {
        href: "/hr/attendance", title: "Pointage", description: "Présence et heures", icon: "⏰",
        colorClass: "from-cyan-500/20 to-cyan-600/10 text-cyan-400",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'hr'
      },
    ]
  }
];

function DashboardCard({ href, title, description, icon, colorClass }: NavButtonProps) {
  return (
    <Link href={href} className="group relative flex flex-col gap-3 p-5 glass-card overflow-hidden">
      {/* Gradient background strip */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorClass} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClass} text-2xl`}>
          {icon}
        </div>
        <div className="text-slate-400 group-hover:text-sky-400 transition-all duration-300 text-xl group-hover:translate-x-1">
          →
        </div>
      </div>
      <div>
        <h3 className="font-bold text-white text-base mb-0.5 group-hover:text-sky-300 transition-colors">{title}</h3>
        <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}

function StatCard({ label, value, trend, href, iconColor = 'sky' }: { label: string; value: string; trend?: string; href?: string; iconColor?: string }) {
  const content = (
    <div className={`stat-card p-4 ${href ? 'cursor-pointer hover:border-sky-500/30' : ''}`}>
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
      <div className="flex items-end gap-2 mt-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {trend && (
          <span className={`text-xs font-medium mb-1 ${trend.includes('⚠') ? 'text-amber-400' : trend.includes('✅') ? 'text-emerald-400' : 'text-emerald-400'}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
}

function DashboardHomePage() {
  const [userName, setUserName] = useState("Utilisateur");
  const [userRole, setUserRole] = useState("");
  const [userPermissions, setUserPermissions] = useState<string[] | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [stats, setStats] = useState({
    monthlySales: 0,
    pendingOrders: 0,
    lowStockItems: 0,
    newCustomers: 0,
    clientBalance: 0,
    supplierBalance: 0
  });
  const router = useRouter();

  // Balance detail modals
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [clientsData, setClientsData] = useState<any[]>([]);
  const [suppliersData, setSuppliersData] = useState<any[]>([]);
  const [clientTotals, setClientTotals] = useState<any>(null);
  const [supplierTotals, setSupplierTotals] = useState<any>(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem('user_name');
    const storedRole = localStorage.getItem('user_role');
    const storedPerms = localStorage.getItem('user_permissions');

    if (storedName) setUserName(storedName);
    if (storedRole) setUserRole(storedRole);
    if (storedPerms) {
      try {
        setUserPermissions(JSON.parse(storedPerms));
      } catch (e) {
        console.error("Failed to parse permissions", e);
      }
    } else {
      setUserPermissions(null);
    }

    // Check if super-admin
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        if (decoded.role === 'ADMIN' && decoded.tenantId === 'd0000000-0000-0000-0000-000000000000') {
          setIsSuperAdmin(true);
        }
      } catch (e) {
        console.error("Failed to decode token for super admin check", e);
      }
    }

    if (storedRole && ['ADMIN', 'MANAGER'].includes(storedRole)) {
      fetchStats();
    }
  }, [router]);

  const fetchStats = async () => {
    try {
      const response = await api.getDashboardSummary() as any;
      if (response.success && response.data) {
        setStats({
          ...response.data,
          clientBalance: response.data.clientBalance || 0,
          supplierBalance: response.data.supplierBalance || 0
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats", error);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(val);

  const openClientModal = async () => {
    setClientModalOpen(true);
    setLoadingClients(true);
    try {
      const response = await api.getClientsBalance() as any;
      if (response.success) {
        setClientsData(response.data || []);
        setClientTotals(response.totals);
      }
    } catch (error) {
      console.error('Failed to fetch client balances', error);
    } finally {
      setLoadingClients(false);
    }
  };

  const openSupplierModal = async () => {
    setSupplierModalOpen(true);
    setLoadingSuppliers(true);
    try {
      const response = await api.getSuppliersBalance() as any;
      if (response.success) {
        setSuppliersData(response.data || []);
        setSupplierTotals(response.totals);
      }
    } catch (error) {
      console.error('Failed to fetch supplier balances', error);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ========== Header ========== */}
        <header className="glass-card p-6 animate-fade-in-up">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Logo et Titre */}
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-2xl bg-gradient-to-br from-sky-500/20 to-teal-500/20 flex items-center justify-center border border-white/[0.06]">
                <span className="text-3xl md:text-4xl">🏗️</span>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  Bonjour, <span className="bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent font-black">{userName}</span> 👋
                </h1>
                <p className="text-slate-400 mt-1 text-sm">
                  Connecté en tant que : <span className="font-medium bg-slate-800/60 px-2.5 py-0.5 rounded-lg text-sky-300 border border-sky-500/20">{userRole || 'Invité'}</span>
                </p>
              </div>
            </div>

            {/* Droite: Date et Déconnexion */}
            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right mr-4">
                <p className="text-xs text-slate-500">Date du jour</p>
                <p className="text-sm font-semibold text-slate-300">{formatDate(new Date())}</p>
              </div>
              <button
                onClick={handleLogout}
                className="btn-glassy px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2"
              >
                <span>Déconnexion</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </div>
        </header>

        {/* ========== Stats Row (Admin/Manager) ========== */}
        {['ADMIN', 'MANAGER'].includes(userRole) && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in-up delay-100">
            <StatCard label="Ventes du Mois" value={formatCurrency(stats.monthlySales)} trend="+0%" />
            <StatCard label="Commandes en cours" value={stats.pendingOrders.toString()} href="/orders" />
            <StatCard label="Alertes Stock" value={stats.lowStockItems.toString()} trend={stats.lowStockItems > 0 ? "⚠️" : "✅"} href="/inventory?filter=low" />

            {/* Client Balance */}
            <div
              onClick={openClientModal}
              className={`stat-card p-4 cursor-pointer hover:border-sky-500/30 ${stats.clientBalance > 0 ? 'border-l-2 border-l-amber-500/50' : 'border-l-2 border-l-emerald-500/50'}`}
            >
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Reste Clients</p>
              <div className="flex items-end gap-2 mt-2">
                <span className={`text-2xl font-bold ${stats.clientBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {formatCurrency(stats.clientBalance)}
                </span>
                <span className="text-xs text-slate-500 mb-1">📋</span>
              </div>
            </div>

            {/* Supplier Balance */}
            <div
              onClick={openSupplierModal}
              className={`stat-card p-4 cursor-pointer hover:border-sky-500/30 ${stats.supplierBalance > 0 ? 'border-l-2 border-l-red-500/50' : 'border-l-2 border-l-emerald-500/50'}`}
            >
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Reste Fournisseurs</p>
              <div className="flex items-end gap-2 mt-2">
                <span className={`text-2xl font-bold ${stats.supplierBalance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {formatCurrency(stats.supplierBalance)}
                </span>
                <span className="text-xs text-slate-500 mb-1">📋</span>
              </div>
            </div>
          </div>
        )}

        {/* ========== Navigation Sections ========== */}
        <div className="space-y-8">
          {dashboardConfig.map((section, index) => {
            const visibleItems = section.items.filter(item => {
              if (userPermissions && userPermissions.length > 0) {
                return userPermissions.includes(item.permissionKey);
              }
              return !userRole || item.allowedRoles.includes(userRole);
            });

            if (visibleItems.length === 0) return null;

            return (
              <section key={index} className={`space-y-4 animate-fade-in-up delay-${(index + 2) * 100}`}>
                <h2 className="text-lg font-bold text-white pl-3 border-l-4 border-sky-500/60">
                  {section.title}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleItems.map((item) => (
                    <DashboardCard key={item.href} {...item} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Super Admin Section */}
          {isSuperAdmin && (
            <section className="space-y-4 animate-fade-in-up">
              <h2 className="text-lg font-bold text-white pl-3 border-l-4 border-indigo-500">
                Super-Administration Système
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <DashboardCard
                  href="/admin/dashboard"
                  title="Super-Admin Panel"
                  description="Gérer les boutiques, abonnements et configurations globales"
                  icon="🛡️"
                  colorClass="from-indigo-500/20 to-indigo-600/10 text-indigo-400"
                  allowedRoles={['ADMIN']}
                  permissionKey="superadmin"
                />
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ========== Client Balance Modal ========== */}
      {clientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-5xl glass-modal max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">👥 Détails - Reste Clients</h2>
                <p className="text-sm text-slate-400">Montants dus par les clients</p>
              </div>
              <button onClick={() => setClientModalOpen(false)} className="text-slate-500 hover:text-white text-2xl transition-colors w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingClients ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-sky-900/30 border-t-sky-400 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500">Chargement...</p>
                </div>
              ) : clientsData.length === 0 ? (
                <div className="text-center py-12 text-slate-500">Aucun client avec solde</div>
              ) : (
                <>
                  {clientTotals && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="stat-card p-3">
                        <p className="text-xs text-sky-400 uppercase font-medium">Total Vendu</p>
                        <p className="text-xl font-bold text-white">{formatCurrency(clientTotals.totalBought)}</p>
                      </div>
                      <div className="stat-card p-3">
                        <p className="text-xs text-emerald-400 uppercase font-medium">Total Payé</p>
                        <p className="text-xl font-bold text-emerald-400">{formatCurrency(clientTotals.totalPaid)}</p>
                      </div>
                      <div className="stat-card p-3">
                        <p className="text-xs text-amber-400 uppercase font-medium">Reste à Payer</p>
                        <p className="text-xl font-bold text-amber-400">{formatCurrency(clientTotals.totalBalance)}</p>
                      </div>
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="p-3 text-left text-xs uppercase text-slate-400 font-medium">Client</th>
                        <th className="p-3 text-center text-xs uppercase text-slate-400 font-medium">Type</th>
                        <th className="p-3 text-right text-xs uppercase text-slate-400 font-medium">Total Acheté</th>
                        <th className="p-3 text-right text-xs uppercase text-slate-400 font-medium">Total Payé</th>
                        <th className="p-3 text-right text-xs uppercase text-slate-400 font-medium">Reste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {clientsData.map((c: any) => (
                        <tr key={c.customerid} className="hover:bg-white/[0.03] transition-colors">
                          <td className="p-3 font-medium text-white">
                            {c.customername}
                            <span className="text-xs text-slate-500 ml-2">{c.customercode}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.customertype === 'WHOLESALE' ? 'bg-violet-500/20 text-violet-300' : 'bg-teal-500/20 text-teal-300'}`}>
                              {c.customertype === 'WHOLESALE' ? 'Gros' : 'Détail'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono text-white">{formatCurrency(parseFloat(c.totalbought))}</td>
                          <td className="p-3 text-right font-mono text-emerald-400">{formatCurrency(parseFloat(c.totalpaid))}</td>
                          <td className={`p-3 text-right font-mono font-bold ${parseFloat(c.balance) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {formatCurrency(parseFloat(c.balance))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="p-4 border-t border-white/5 flex justify-end">
              <button onClick={() => setClientModalOpen(false)} className="bg-slate-800/60 border border-slate-600/40 text-slate-300 hover:bg-slate-700/60 hover:text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Supplier Balance Modal ========== */}
      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-5xl glass-modal max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">🏭 Détails - Reste Fournisseurs</h2>
                <p className="text-sm text-slate-400">Montants dus aux fournisseurs</p>
              </div>
              <button onClick={() => setSupplierModalOpen(false)} className="text-slate-500 hover:text-white text-2xl transition-colors w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingSuppliers ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-red-900/30 border-t-red-400 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500">Chargement...</p>
                </div>
              ) : suppliersData.length === 0 ? (
                <div className="text-center py-12 text-slate-500">Aucun fournisseur avec solde</div>
              ) : (
                <>
                  {supplierTotals && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="stat-card p-3">
                        <p className="text-xs text-sky-400 uppercase font-medium">Total Acheté</p>
                        <p className="text-xl font-bold text-white">{formatCurrency(supplierTotals.totalBought)}</p>
                      </div>
                      <div className="stat-card p-3">
                        <p className="text-xs text-emerald-400 uppercase font-medium">Total Payé</p>
                        <p className="text-xl font-bold text-emerald-400">{formatCurrency(supplierTotals.totalPaid)}</p>
                      </div>
                      <div className="stat-card p-3">
                        <p className="text-xs text-red-400 uppercase font-medium">Reste à Régler</p>
                        <p className="text-xl font-bold text-red-400">{formatCurrency(supplierTotals.totalBalance)}</p>
                      </div>
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="p-3 text-left text-xs uppercase text-slate-400 font-medium">Fournisseur</th>
                        <th className="p-3 text-left text-xs uppercase text-slate-400 font-medium">Contact</th>
                        <th className="p-3 text-right text-xs uppercase text-slate-400 font-medium">Total Acheté</th>
                        <th className="p-3 text-right text-xs uppercase text-slate-400 font-medium">Total Payé</th>
                        <th className="p-3 text-right text-xs uppercase text-slate-400 font-medium">Reste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {suppliersData.map((s: any) => (
                        <tr key={s.factoryid} className="hover:bg-white/[0.03] transition-colors">
                          <td className="p-3 font-medium text-white">{s.factoryname}</td>
                          <td className="p-3 text-slate-400">{s.contactperson || s.phone || '-'}</td>
                          <td className="p-3 text-right font-mono text-white">{formatCurrency(parseFloat(s.totalbought))}</td>
                          <td className="p-3 text-right font-mono text-emerald-400">{formatCurrency(parseFloat(s.totalpaid))}</td>
                          <td className={`p-3 text-right font-mono font-bold ${parseFloat(s.balance) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {formatCurrency(parseFloat(s.balance))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="p-4 border-t border-white/5 flex justify-end">
              <button onClick={() => setSupplierModalOpen(false)} className="bg-slate-800/60 border border-slate-600/40 text-slate-300 hover:bg-slate-700/60 hover:text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PublicLandingPage() {
  const router = useRouter();
  
  // Interactive Simulator State
  const [purchasePrice, setPurchasePrice] = useState<number>(1200);
  const [isRetail, setIsRetail] = useState<boolean>(true);
  const [taxRate] = useState<number>(19); // 19% TVA

  const marginPercent = isRetail ? 30 : 15;
  const marginAmount = purchasePrice * (marginPercent / 100);
  const priceExcludingTax = purchasePrice + marginAmount;
  const taxAmount = priceExcludingTax * (taxRate / 100);
  const finalPrice = priceExcludingTax + taxAmount;

  return (
    <div className="min-h-screen text-slate-100 flex flex-col relative overflow-hidden bg-slate-950 font-sans">
      {/* Background glowing effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-teal-500/[0.08] blur-[140px] animate-pulse" />
        <div className="absolute top-[40%] -left-[10%] w-[500px] h-[500px] rounded-full bg-sky-500/[0.06] blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
        <div className="absolute -bottom-[20%] right-[20%] w-[600px] h-[600px] rounded-full bg-indigo-500/[0.05] blur-[140px]" />
      </div>

      {/* Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center font-bold text-lg text-slate-950">
            🏗️
          </div>
          <span className="text-xl font-black bg-gradient-to-r from-teal-400 to-sky-400 bg-clip-text text-transparent">
            Ceramic ERP
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/login')}
            className="text-sm font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Se Connecter
          </button>
          <button 
            onClick={() => router.push('/register-store')}
            className="btn-glassy px-4 py-2 text-xs font-extrabold uppercase rounded-lg border border-teal-500/30 text-teal-400 shadow-lg shadow-teal-500/5 hover:border-teal-400/50 hover:bg-teal-500/10 transition-all"
          >
            Essai Gratuit
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-20 max-w-7xl mx-auto text-center">
        <div className="max-w-4xl space-y-6">
          <span className="inline-block px-3 py-1.5 rounded-full text-[10px] font-extrabold tracking-widest uppercase bg-teal-500/15 text-teal-400 border border-teal-500/20">
            ⚡ Plateforme Multi-Boutiques de Prochaine Génération
          </span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-tight">
            Gérez votre Négoce de{' '}
            <span className="bg-gradient-to-r from-teal-400 via-sky-400 to-indigo-400 bg-clip-text text-transparent font-black">
              Carrelage &amp; Céramique
            </span>
          </h1>
          <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Un ERP tout-en-un ultra-fluide pour suivre vos stocks en m², palettes et colis, automatiser la facturation POS, analyser vos marges nettes (BI) et notifier vos clients par WhatsApp.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={() => router.push('/register-store')}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 text-slate-950 font-black text-sm shadow-xl shadow-teal-500/20 hover:scale-[1.02] hover:shadow-teal-500/30 active:scale-[0.98] transition-all w-full sm:w-auto"
            >
              Créer ma Boutique (Essai 20j gratuit)
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('margin-simulator');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-4 rounded-xl bg-slate-900/60 border border-white/[0.08] text-slate-300 font-bold text-sm hover:bg-slate-800/40 transition-all w-full sm:w-auto"
            >
              Simuler vos Marges
            </button>
          </div>
        </div>

        {/* Feature Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-24 text-left">
          <div className="glass-card p-6 border border-white/5 hover:border-teal-500/20 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
              📊
            </div>
            <h3 className="font-bold text-white text-lg mb-2">POS &amp; Facturation Fluide</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Enregistrez vos ventes au comptoir en quelques secondes. Générez des factures professionnelles et des tickets de caisse de 80mm en un clic.
            </p>
          </div>

          <div className="glass-card p-6 border border-white/5 hover:border-sky-500/20 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
              📦
            </div>
            <h3 className="font-bold text-white text-lg mb-2">Suivi Métrique du Stock</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Fini les calculs manuels. Suivez instantanément vos niveaux de stock en mètres carrés (m²), cartons complets, palettes ou pièces individuelles.
            </p>
          </div>

          <div className="glass-card p-6 border border-white/5 hover:border-indigo-500/20 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
              🧠
            </div>
            <h3 className="font-bold text-white text-lg mb-2">BI &amp; Intelligence Prédictive</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Anticipez les ruptures de stock grâce aux algorithmes de prévision de la demande. Analysez vos marges réelles pour maximiser vos profits.
            </p>
          </div>
        </section>

        {/* Profit Simulator Section */}
        <section id="margin-simulator" className="w-full max-w-4xl mt-28 mb-12 scroll-mt-6">
          <div className="glass-card p-8 md:p-10 border border-teal-500/20 bg-teal-500/[0.01] relative overflow-hidden text-left">
            <div className="absolute top-0 right-0 bg-teal-500/10 text-teal-400 text-[10px] font-extrabold uppercase px-3.5 py-1.5 rounded-bl-xl border-l border-b border-teal-500/20">
              Simulateur
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">Simulateur de Prix &amp; Marge</h2>
            <p className="text-slate-400 text-sm mb-8">
              Découvrez comment Ceramic ERP calcule automatiquement vos prix de vente finaux en fonction des marges commerciales configurées.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Controls */}
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Type de vente
                  </label>
                  <div className="flex bg-slate-900/80 p-1 rounded-xl border border-white/5">
                    <button
                      onClick={() => setIsRetail(true)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        isRetail 
                          ? 'bg-teal-500 text-slate-950 font-black shadow-md' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                      type="button"
                    >
                      🏬 Détail (+30%)
                    </button>
                    <button
                      onClick={() => setIsRetail(false)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        !isRetail 
                          ? 'bg-teal-500 text-slate-950 font-black shadow-md' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                      type="button"
                    >
                      🏭 Gros (+15%)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Prix d&apos;achat du carrelage (DA/m²)
                  </label>
                  <input
                    type="number"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-900/60 border border-white/[0.08] focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 rounded-xl px-4 py-3 text-lg font-bold text-white text-center"
                  />
                  <input
                    type="range"
                    min="300"
                    max="5000"
                    step="50"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(parseInt(e.target.value))}
                    className="w-full accent-teal-400 mt-4 cursor-pointer"
                  />
                </div>
              </div>

              {/* Live Display Card */}
              <div className="bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-white/5 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between h-full min-h-[220px]">
                <div className="space-y-4">
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Prix Achat Base</span>
                    <span className="font-semibold text-white">{purchasePrice.toLocaleString()} DA</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Marge ({marginPercent}%)</span>
                    <span className="font-semibold text-emerald-400">+{marginAmount.toLocaleString('fr-DZ', { maximumFractionDigits: 1 })} DA</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>TVA ({taxRate}%)</span>
                    <span className="font-semibold text-slate-300">+{taxAmount.toLocaleString('fr-DZ', { maximumFractionDigits: 1 })} DA</span>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-5 mt-5">
                  <p className="text-[10px] uppercase tracking-wider font-extrabold text-teal-400 mb-1">
                    Prix de vente final calculé
                  </p>
                  <p className="text-3xl md:text-4xl font-black text-white tracking-tight">
                    {finalPrice.toLocaleString('fr-DZ', { maximumFractionDigits: 0 })}{' '}
                    <span className="text-sm font-semibold text-slate-400">DA/m² (TTC)</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 border-t border-white/5 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-400 mb-1">Ceramic ERP — La Référence Logistique &amp; POS</p>
        <p>© 2026 Développé par Ramy Kamil Mecheri. Tous droits réservés.</p>
      </footer>
    </div>
  );
}

export default function AppEntryPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    setIsAuthenticated(!!token);
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Chargement de votre session...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <DashboardHomePage />;
  }

  return <PublicLandingPage />;
}
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
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
        colorClass: "bg-red-100 text-red-600",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE'],
        permissionKey: 'sales_pos'
      },
      {
        href: "/orders", title: "Commandes", description: "Suivi des ventes et statuts", icon: "📋",
        colorClass: "bg-gray-100 text-gray-700",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE'],
        permissionKey: 'orders'
      },
      {
        href: "/customers", title: "Clients", description: "Base client et tarifs", icon: "👥",
        colorClass: "bg-red-50 text-red-500",
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
        colorClass: "bg-gray-100 text-gray-700",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE', 'WAREHOUSE'],
        permissionKey: 'inventory'
      },
      {
        href: "/products", title: "Catalogue", description: "Produits et prix de base", icon: "📚",
        colorClass: "bg-red-100 text-red-600",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_RETAIL', 'SALES_WHOLESALE'],
        permissionKey: 'products'
      },
      {
        href: "/purchasing", title: "Achats", description: "Commandes fournisseurs", icon: "🚚",
        colorClass: "bg-gray-100 text-gray-700",
        allowedRoles: ['ADMIN', 'MANAGER', 'SALES_WHOLESALE', 'WAREHOUSE'],
        permissionKey: 'purchasing'
      },
      {
        href: "/logistics", title: "Livraisons", description: "Livraisons, chauffeurs et véhicules", icon: "🚛",
        colorClass: "bg-red-50 text-red-500",
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
        colorClass: "bg-red-100 text-red-600",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'accounting'
      },
      {
        href: "/reports", title: "Rapports", description: "Statistiques et KPIs", icon: "📊",
        colorClass: "bg-gray-100 text-gray-700",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'reports'
      },
      {
        href: "/brands", title: "Marques", description: "Configuration des marques", icon: "🏷️",
        colorClass: "bg-red-50 text-red-500",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'brands'
      },
      {
        href: "/settings", title: "Paramètres", description: "Configuration de l'application", icon: "⚙️",
        colorClass: "bg-gray-100 text-gray-700",
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
        colorClass: "bg-red-100 text-red-600",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'hr'
      },
      {
        href: "/hr/attendance", title: "Pointage", description: "Présence et heures", icon: "⏰",
        colorClass: "bg-gray-100 text-gray-700",
        allowedRoles: ['ADMIN', 'MANAGER'],
        permissionKey: 'hr'
      },
    ]
  }
];

function DashboardCard({ href, title, description, icon, colorClass }: NavButtonProps) {
  return (
    <Link href={href} className="group relative flex flex-col gap-3 p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:border-red-400 hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-lg ${colorClass} text-2xl`}>
          {icon}
        </div>
        <div className="text-gray-300 group-hover:text-red-500 transition-colors text-xl">
          →
        </div>
      </div>
      <div>
        <h3 className="font-bold text-gray-800 text-lg mb-1 group-hover:text-red-600 transition-colors">{title}</h3>
        <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}

function StatCard({ label, value, trend, href }: { label: string, value: string, trend?: string, href?: string }) {
  const content = (
    <div className={`bg-white p-4 rounded-xl border border-gray-200 shadow-sm ${href ? 'hover:bg-red-50 hover:border-red-300 cursor-pointer transition-colors' : ''}`}>
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</p>
      <div className="flex items-end gap-2 mt-1">
        <span className="text-2xl font-bold text-gray-800">{value}</span>
        {trend && <span className="text-xs font-medium text-green-600 mb-1">{trend}</span>}
      </div>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
}

export default function DashboardHomePage() {
  const [userName, setUserName] = useState("Utilisateur");
  const [userRole, setUserRole] = useState("");
  const [userPermissions, setUserPermissions] = useState<string[] | null>(null);
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

        {/* En-tête avec Logo */}
        <header className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Logo et Titre */}
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 md:w-20 md:h-20">
                <Image
                  src="/logo-allaoua-ceram.png"
                  alt="Allaoua Ceram"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                  Bonjour, <span className="text-red-600">{userName}</span> 👋
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Connecté en tant que : <span className="font-medium bg-gray-100 px-2 py-0.5 rounded text-gray-700">{userRole || 'Invité'}</span>
                </p>
              </div>
            </div>

            {/* Droite: Date et Déconnexion */}
            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right mr-4">
                <p className="text-xs text-gray-400">Date du jour</p>
                <p className="text-sm font-semibold text-gray-700">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white hover:bg-red-700 px-4 py-2.5 rounded-lg font-medium text-sm transition flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <span>Déconnexion</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </div>
        </header>

        {/* Statistiques Rapides (Admin/Manager uniquement) */}
        {['ADMIN', 'MANAGER'].includes(userRole) && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="Ventes du Mois" value={formatCurrency(stats.monthlySales)} trend="+0%" />
            <StatCard label="Commandes en cours" value={stats.pendingOrders.toString()} href="/orders" />
            <StatCard label="Alertes Stock" value={stats.lowStockItems.toString()} trend={stats.lowStockItems > 0 ? "⚠️" : "✅"} href="/inventory?filter=low" />
            {/* Balance Cards - Clickable */}
            <div
              onClick={openClientModal}
              className={`p-4 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all ${stats.clientBalance > 0 ? 'bg-orange-50 border-orange-200 hover:border-orange-400' : 'bg-green-50 border-green-200 hover:border-green-400'}`}
            >
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Reste Clients</p>
              <div className="flex items-end gap-2 mt-1">
                <span className={`text-2xl font-bold ${stats.clientBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatCurrency(stats.clientBalance)}
                </span>
                <span className="text-xs text-gray-400 mb-1">📋 Détails</span>
              </div>
            </div>
            <div
              onClick={openSupplierModal}
              className={`p-4 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all ${stats.supplierBalance > 0 ? 'bg-red-50 border-red-200 hover:border-red-400' : 'bg-green-50 border-green-200 hover:border-green-400'}`}
            >
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Reste Fournisseurs</p>
              <div className="flex items-end gap-2 mt-1">
                <span className={`text-2xl font-bold ${stats.supplierBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(stats.supplierBalance)}
                </span>
                <span className="text-xs text-gray-400 mb-1">📋 Détails</span>
              </div>
            </div>
          </div>
        )}

        {/* Sections de Navigation */}
        <div className="space-y-8">
          {dashboardConfig.map((section, index) => {
            const visibleItems = section.items.filter(item => {
              // If user has specific permissions override
              if (userPermissions && userPermissions.length > 0) {
                return userPermissions.includes(item.permissionKey);
              }
              // Fallback to Role
              return !userRole || item.allowedRoles.includes(userRole);
            });

            if (visibleItems.length === 0) return null;

            return (
              <section key={index} className="space-y-4">
                <h2 className="text-lg font-bold text-gray-700 pl-3 border-l-4 border-red-600">
                  {section.title}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visibleItems.map((item) => (
                    <DashboardCard key={item.href} {...item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Client Balance Modal */}
      {clientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-orange-50 rounded-t-xl">
              <div>
                <h2 className="text-lg font-bold text-orange-700">👥 Détails - Reste Clients</h2>
                <p className="text-sm text-orange-600">Montants dus par les clients</p>
              </div>
              <button onClick={() => setClientModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingClients ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500">Chargement...</p>
                </div>
              ) : clientsData.length === 0 ? (
                <div className="text-center py-12 text-slate-400">Aucun client avec solde</div>
              ) : (
                <>
                  {clientTotals && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-600 uppercase font-medium">Total Vendu</p>
                        <p className="text-xl font-bold text-blue-700">{formatCurrency(clientTotals.totalBought)}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <p className="text-xs text-green-600 uppercase font-medium">Total Payé</p>
                        <p className="text-xl font-bold text-green-700">{formatCurrency(clientTotals.totalPaid)}</p>
                      </div>
                      <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                        <p className="text-xs text-orange-600 uppercase font-medium">Reste à Payer</p>
                        <p className="text-xl font-bold text-orange-700">{formatCurrency(clientTotals.totalBalance)}</p>
                      </div>
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="p-3 text-left">Client</th>
                        <th className="p-3 text-center">Type</th>
                        <th className="p-3 text-right">Total Acheté</th>
                        <th className="p-3 text-right">Total Payé</th>
                        <th className="p-3 text-right bg-orange-100">Reste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {clientsData.map((c: any) => (
                        <tr key={c.customerid} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-800">
                            {c.customername}
                            <span className="text-xs text-slate-400 ml-2">{c.customercode}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.customertype === 'WHOLESALE' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>
                              {c.customertype === 'WHOLESALE' ? 'Gros' : 'Détail'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono">{formatCurrency(parseFloat(c.totalbought))}</td>
                          <td className="p-3 text-right font-mono text-green-600">{formatCurrency(parseFloat(c.totalpaid))}</td>
                          <td className={`p-3 text-right font-mono font-bold ${parseFloat(c.balance) > 0 ? 'text-orange-600 bg-orange-50' : 'text-green-600'}`}>
                            {formatCurrency(parseFloat(c.balance))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setClientModalOpen(false)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Balance Modal */}
      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-red-50 rounded-t-xl">
              <div>
                <h2 className="text-lg font-bold text-red-700">🏭 Détails - Reste Fournisseurs</h2>
                <p className="text-sm text-red-600">Montants dus aux fournisseurs</p>
              </div>
              <button onClick={() => setSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingSuppliers ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500">Chargement...</p>
                </div>
              ) : suppliersData.length === 0 ? (
                <div className="text-center py-12 text-slate-400">Aucun fournisseur avec solde</div>
              ) : (
                <>
                  {supplierTotals && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-600 uppercase font-medium">Total Acheté</p>
                        <p className="text-xl font-bold text-blue-700">{formatCurrency(supplierTotals.totalBought)}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <p className="text-xs text-green-600 uppercase font-medium">Total Payé</p>
                        <p className="text-xl font-bold text-green-700">{formatCurrency(supplierTotals.totalPaid)}</p>
                      </div>
                      <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                        <p className="text-xs text-red-600 uppercase font-medium">Reste à Régler</p>
                        <p className="text-xl font-bold text-red-700">{formatCurrency(supplierTotals.totalBalance)}</p>
                      </div>
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="p-3 text-left">Fournisseur</th>
                        <th className="p-3 text-left">Contact</th>
                        <th className="p-3 text-right">Total Acheté</th>
                        <th className="p-3 text-right">Total Payé</th>
                        <th className="p-3 text-right bg-red-100">Reste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {suppliersData.map((s: any) => (
                        <tr key={s.factoryid} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-800">{s.factoryname}</td>
                          <td className="p-3 text-slate-600">{s.contactperson || s.phone || '-'}</td>
                          <td className="p-3 text-right font-mono">{formatCurrency(parseFloat(s.totalbought))}</td>
                          <td className="p-3 text-right font-mono text-green-600">{formatCurrency(parseFloat(s.totalpaid))}</td>
                          <td className={`p-3 text-right font-mono font-bold ${parseFloat(s.balance) > 0 ? 'text-red-600 bg-red-50' : 'text-green-600'}`}>
                            {formatCurrency(parseFloat(s.balance))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSupplierModalOpen(false)} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
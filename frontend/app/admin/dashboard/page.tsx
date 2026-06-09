'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface Store {
  tenantid: string;
  storename: string;
  domainprefix: string;
  plantype: 'TRIAL' | 'BASIC' | 'PREMIUM';
  trialstartdate: string;
  trialenddate: string;
  subscriptionstatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  createdat: string;
  usercount: number;
  daysremaining: number;
}

interface Stats {
  totalstores: number;
  activetrials: number;
  activepaid: number;
  expiredstores: number;
  suspendedstores: number;
}

export default function AdminDashboardPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSignups, setRecentSignups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    // 1. Verify Super-Admin Access
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      setError('Access Denied: Connection required.');
      setLoading(false);
      return;
    }

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

      const DEFAULT_TENANT_ID = 'd0000000-0000-0000-0000-000000000000';
      if (decoded.role === 'ADMIN' && decoded.tenantId === DEFAULT_TENANT_ID) {
        setIsSuperAdmin(true);
        loadDashboardData();
      } else {
        setError('Accès Refusé: Cet espace est réservé au Super-Administrateur.');
        setLoading(false);
      }
    } catch (err) {
      setError('Accès Refusé: Erreur de validation de session.');
      setLoading(false);
    }
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [storesRes, statsRes] = await Promise.all([
        api.getSuperAdminStores(),
        api.getSuperAdminStats(),
      ]);

      if (storesRes.success && storesRes.data) {
        setStores(storesRes.data as Store[]);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data.stats);
        setRecentSignups(statsRes.data.recentSignups);
      }
    } catch (err: any) {
      console.error('Failed to load super-admin dashboard', err);
      setError(err.message || 'Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTrial = async (tenantId: string, currentEndDate: string) => {
    setActionLoading(tenantId);
    try {
      const current = new Date(currentEndDate);
      // Extend by 30 days
      current.setDate(current.getDate() + 30);
      const newEndDate = current.toISOString();

      const res = await api.updateStoreSubscription(tenantId, {
        trialEndDate: newEndDate,
        subscriptionStatus: 'ACTIVE', // Reactivate if it was expired
      });

      if (res.success) {
        alert('✅ Période d\'essai prolongée de 30 jours !');
        loadDashboardData();
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message || 'Action impossible'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateStatus = async (tenantId: string, newStatus: 'ACTIVE' | 'SUSPENDED') => {
    setActionLoading(tenantId);
    try {
      const res = await api.updateStoreSubscription(tenantId, {
        subscriptionStatus: newStatus,
      });

      if (res.success) {
        alert(`✅ Statut mis à jour vers: ${newStatus}`);
        loadDashboardData();
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message || 'Action impossible'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdatePlan = async (tenantId: string, newPlan: 'TRIAL' | 'BASIC' | 'PREMIUM') => {
    setActionLoading(tenantId);
    try {
      const res = await api.updateStoreSubscription(tenantId, {
        planType: newPlan,
      });

      if (res.success) {
        alert(`✅ Plan mis à jour vers: ${newPlan}`);
        loadDashboardData();
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      alert(`❌ Erreur: ${err.message || 'Action impossible'}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 font-medium animate-pulse">Chargement du panneau d'administration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100 p-4">
        <div className="bg-slate-900/80 border border-red-500/20 rounded-2xl max-w-md w-full p-8 text-center backdrop-blur-xl shadow-2xl">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Accès Non Autorisé</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <Link href="/" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm px-6 py-2.5 rounded-xl transition">
            Retour à l'Accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-slate-900/60 border border-white/[0.06] backdrop-blur-md rounded-2xl p-6 shadow-xl">
          <div>
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
              Super-Admin UI Panel
            </h1>
            <p className="text-sm text-slate-400 mt-1">Supervision de l'infrastructure multilocataire de Ceramic ERP</p>
          </div>
          <Link href="/" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/[0.08] text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md">
            ← Dashboard Principal
          </Link>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900/40 border border-white/[0.06] backdrop-blur-md rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Boutiques</span>
              <span className="text-3xl font-extrabold text-white mt-2">{stats.totalstores}</span>
            </div>
            <div className="bg-slate-900/40 border border-white/[0.06] backdrop-blur-md rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Essais Actifs</span>
              <span className="text-3xl font-extrabold text-sky-400 mt-2">{stats.activetrials}</span>
            </div>
            <div className="bg-slate-900/40 border border-white/[0.06] backdrop-blur-md rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Abonnements Paid</span>
              <span className="text-3xl font-extrabold text-emerald-400 mt-2">{stats.activepaid}</span>
            </div>
            <div className="bg-slate-900/40 border border-white/[0.06] backdrop-blur-md rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Essais Expirés</span>
              <span className="text-3xl font-extrabold text-amber-500 mt-2">{stats.expiredstores}</span>
            </div>
            <div className="bg-slate-900/40 border border-white/[0.06] backdrop-blur-md rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Suspendues</span>
              <span className="text-3xl font-extrabold text-red-500 mt-2">{stats.suspendedstores}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Stores List (Col-span 3) */}
          <div className="lg:col-span-3 bg-slate-900/50 border border-white/[0.06] backdrop-blur-md rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-200">Liste des Boutiques</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400 uppercase font-bold tracking-wider">
                    <th className="pb-3 pt-2">Boutique / Domaine</th>
                    <th className="pb-3 pt-2">Créée le</th>
                    <th className="pb-3 pt-2">Plan / Statut</th>
                    <th className="pb-3 pt-2">Jours Restants</th>
                    <th className="pb-3 pt-2">Utilisateurs</th>
                    <th className="pb-3 pt-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {stores.map(store => {
                    const isDefault = store.tenantid === 'd0000000-0000-0000-0000-000000000000';
                    const isExpired = store.subscriptionstatus === 'EXPIRED';
                    const isSuspended = store.subscriptionstatus === 'SUSPENDED';

                    return (
                      <tr key={store.tenantid} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 pr-3">
                          <div className="font-semibold text-slate-200">{store.storename}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{store.domainprefix}.vercel.app</div>
                        </td>
                        <td className="py-4 text-slate-400">
                          {new Date(store.createdat).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="py-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              store.plantype === 'PREMIUM' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                              store.plantype === 'BASIC' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' :
                              'bg-slate-500/20 text-slate-300 border border-slate-500/20'
                            }`}>
                              {store.plantype}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                              isSuspended ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              isExpired ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {store.subscriptionstatus}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 font-mono">
                          {isDefault ? (
                            <span className="text-slate-500">N/A (Système)</span>
                          ) : (
                            <span className={store.daysremaining <= 0 ? 'text-red-400 font-bold' : store.daysremaining <= 5 ? 'text-amber-400 font-medium' : 'text-slate-300'}>
                              {store.daysremaining <= 0 ? 'Expiré' : `${store.daysremaining} jours`}
                            </span>
                          )}
                        </td>
                        <td className="py-4 text-slate-300 font-mono pl-4">
                          {store.usercount}
                        </td>
                        <td className="py-4 text-right">
                          {isDefault ? (
                            <span className="text-slate-500 text-[10px] italic">Non modifiable</span>
                          ) : (
                            <div className="flex justify-end gap-1.5">
                              {/* Extend Trial */}
                              {store.plantype === 'TRIAL' && (
                                <button
                                  disabled={actionLoading === store.tenantid}
                                  onClick={() => handleExtendTrial(store.tenantid, store.trialenddate)}
                                  className="bg-sky-600/20 hover:bg-sky-600 text-sky-400 hover:text-white border border-sky-500/30 font-semibold px-2 py-1 rounded text-[10px] transition disabled:opacity-50"
                                >
                                  +30 Jours
                                </button>
                              )}
                              
                              {/* Upgrade Plan dropdown or toggle */}
                              <select
                                value={store.plantype}
                                disabled={actionLoading === store.tenantid}
                                onChange={(e) => handleUpdatePlan(store.tenantid, e.target.value as any)}
                                className="bg-slate-800 border border-white/[0.08] text-slate-300 font-semibold px-1.5 py-1 rounded text-[10px] focus:outline-none"
                              >
                                <option value="TRIAL">Plan: TRIAL</option>
                                <option value="BASIC">Plan: BASIC</option>
                                <option value="PREMIUM">Plan: PREMIUM</option>
                              </select>

                              {/* Block/Unblock Toggle */}
                              {isSuspended ? (
                                <button
                                  disabled={actionLoading === store.tenantid}
                                  onClick={() => handleUpdateStatus(store.tenantid, 'ACTIVE')}
                                  className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 font-semibold px-2 py-1 rounded text-[10px] transition disabled:opacity-50"
                                >
                                  Réactiver
                                </button>
                              ) : (
                                <button
                                  disabled={actionLoading === store.tenantid}
                                  onClick={() => handleUpdateStatus(store.tenantid, 'SUSPENDED')}
                                  className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 font-semibold px-2 py-1 rounded text-[10px] transition disabled:opacity-50"
                                >
                                  Suspendre
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Feed (Col-span 1) */}
          <div className="bg-slate-900/50 border border-white/[0.06] backdrop-blur-md rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-200">Récemment Inscrites</h2>
            
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {recentSignups.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Aucune inscription récente</p>
              ) : (
                recentSignups.map(signup => {
                  const daysAgo = Math.floor((Date.now() - new Date(signup.createdat).getTime()) / 86400000);
                  
                  return (
                    <div key={signup.tenantid} className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl flex flex-col gap-1.5">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-xs text-slate-200">{signup.storename}</span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {daysAgo === 0 ? "Aujourd'hui" : `Il y a ${daysAgo} j`}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span className="font-mono">@{signup.domainprefix}</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 font-bold uppercase text-[8px] border border-indigo-500/20">
                          {signup.plantype}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

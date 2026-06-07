'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

/* ============================================
   SVG Mini Chart Components (Lightweight, no deps)
   ============================================ */

function MiniBarChart({ data, maxVal, color = '#0284C7' }: { data: number[]; maxVal: number; color?: string }) {
  const barW = 100 / Math.max(data.length, 1);
  return (
    <svg viewBox="0 0 100 40" className="w-full h-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`bar-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {data.map((v, i) => {
        const h = maxVal > 0 ? (v / maxVal) * 36 : 0;
        return (
          <rect
            key={i}
            x={i * barW + barW * 0.15}
            y={40 - h}
            width={barW * 0.7}
            height={h}
            fill={`url(#bar-${color.replace('#','')})`}
            rx="1"
            className="transition-all duration-500"
          />
        );
      })}
    </svg>
  );
}

function GaugeRing({ value, max, color = '#0284C7', label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference * (1 - pct);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
        <text x="50" y="48" textAnchor="middle" fill="white" fontSize="14" fontWeight="700">
          {Math.round(pct * 100)}%
        </text>
        <text x="50" y="62" textAnchor="middle" fill="#94A3B8" fontSize="7">
          {label}
        </text>
      </svg>
    </div>
  );
}

/* ============================================
   Main Analytics Page
   ============================================ */
export default function AnalyticsPage() {
  // State
  const [activeTab, setActiveTab] = useState<'overview' | 'forecast' | 'whatsapp'>('overview');
  const [loading, setLoading] = useState(true);
  const [lowStock, setLowStock] = useState<any>(null);
  const [trending, setTrending] = useState<any>(null);
  const [profitAnalysis, setProfitAnalysis] = useState<any>(null);
  const [forecastDays, setForecastDays] = useState(30);

  // WhatsApp state
  const [waPhone, setWaPhone] = useState('');
  const [waType, setWaType] = useState<'INVOICE' | 'OVERDUE'>('INVOICE');
  const [waInvoice, setWaInvoice] = useState('');
  const [waAmount, setWaAmount] = useState('');
  const [waCustomerName, setWaCustomerName] = useState('');
  const [waBalance, setWaBalance] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [lowStockRes, trendingRes, profitRes] = await Promise.all([
        api.getLowStockPredictions(7, forecastDays) as any,
        api.getTrendingProducts(forecastDays) as any,
        api.getProfitMarginAnalysis() as any,
      ]);
      if (lowStockRes.success) setLowStock(lowStockRes.data);
      if (trendingRes.success) setTrending(trendingRes.data);
      if (profitRes.success) setProfitAnalysis(profitRes.data);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [forecastDays]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(v);

  const handleSendWhatsapp = async () => {
    setWaSending(true);
    setWaResult(null);
    try {
      const payload: any = { phone: waPhone, type: waType };
      if (waType === 'INVOICE') {
        payload.invoiceNumber = waInvoice;
        payload.amount = parseFloat(waAmount);
      } else {
        payload.customerName = waCustomerName;
        payload.balance = parseFloat(waBalance);
      }
      const res = await api.sendWhatsappNotification(payload) as any;
      setWaResult(res);
    } catch (err: any) {
      setWaResult({ success: false, message: err.message });
    } finally {
      setWaSending(false);
    }
  };

  const tabs = [
    { id: 'overview' as const, label: '📊 Vue Générale', desc: 'KPIs & marges' },
    { id: 'forecast' as const, label: '📈 Prévisions Stock', desc: 'Alertes rupture' },
    { id: 'whatsapp' as const, label: '💬 WhatsApp', desc: 'Notifications' },
  ];

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ========== Header ========== */}
        <header className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-up">
          <div>
            <Link href="/" className="text-sm text-sky-400 hover:text-sky-300 transition-colors mb-2 inline-flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 011.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
              Retour au tableau de bord
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Analyses & <span className="bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent">Intelligence</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Prévisions, tendances et notifications clients</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400">Période :</label>
            <select
              value={forecastDays}
              onChange={(e) => setForecastDays(Number(e.target.value))}
              className="bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:border-sky-500 transition-colors"
            >
              <option value={7}>7 jours</option>
              <option value={14}>14 jours</option>
              <option value={30}>30 jours</option>
              <option value={60}>60 jours</option>
              <option value={90}>90 jours</option>
            </select>
          </div>
        </header>

        {/* ========== Tab Navigation ========== */}
        <div className="flex gap-2 overflow-x-auto pb-1 animate-fade-in-up delay-100">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-300 border ${
                activeTab === tab.id
                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-lg shadow-black/20 shadow-sky-500/10'
                  : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
              }`}
            >
              <span className="block text-base">{tab.label}</span>
              <span className="block text-xs opacity-60 mt-0.5">{tab.desc}</span>
            </button>
          ))}
        </div>

        {/* ========== Loading ========== */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-sky-900/30 rounded-full" />
              <div className="absolute top-0 w-16 h-16 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        )}

        {/* ========== OVERVIEW TAB ========== */}
        {!loading && activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in-up delay-200">

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Revenue */}
              <div className="stat-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Chiffre d&apos;Affaires</span>
                  <span className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-lg">💰</span>
                </div>
                <p className="text-2xl font-bold text-white">{profitAnalysis ? formatCurrency(profitAnalysis.revenue) : '—'}</p>
              </div>

              {/* COGS */}
              <div className="stat-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Coût Marchandises</span>
                  <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-lg">📦</span>
                </div>
                <p className="text-2xl font-bold text-white">{profitAnalysis ? formatCurrency(profitAnalysis.cogs) : '—'}</p>
              </div>

              {/* Gross Profit */}
              <div className="stat-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Bénéfice Brut</span>
                  <span className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center text-lg">📈</span>
                </div>
                <p className={`text-2xl font-bold ${profitAnalysis?.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {profitAnalysis ? formatCurrency(profitAnalysis.grossProfit) : '—'}
                </p>
              </div>

              {/* Margin Gauge */}
              <div className="stat-card p-5 flex items-center justify-center">
                {profitAnalysis ? (
                  <GaugeRing
                    value={profitAnalysis.grossMarginPercent}
                    max={100}
                    color={profitAnalysis.grossMarginPercent >= 25 ? '#10B981' : '#EF4444'}
                    label="Marge"
                  />
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </div>
            </div>

            {/* Margin Issues Alert */}
            {profitAnalysis?.issues?.length > 0 && (
              <div className="glass-card p-4 border-l-4 border-amber-500 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-amber-400">⚠️</span>
                  <span className="font-semibold text-amber-300 text-sm">Alertes Marge</span>
                </div>
                {profitAnalysis.issues.map((issue: string, i: number) => (
                  <p key={i} className="text-sm text-amber-200/80 ml-6">{issue}</p>
                ))}
              </div>
            )}

            {/* Trending Products */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trending Up */}
              <div className="glass-card p-5">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-sm">🔥</span>
                  Produits en Hausse
                </h3>
                {trending?.trendingUp?.length > 0 ? (
                  <>
                    <MiniBarChart
                      data={trending.trendingUp.map((p: any) => p.recentQuantity)}
                      maxVal={Math.max(...trending.trendingUp.map((p: any) => p.recentQuantity))}
                      color="#10B981"
                    />
                    <div className="mt-4 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                      {trending.trendingUp.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{p.productName}</p>
                            <p className="text-xs text-slate-500">{p.productCode}</p>
                          </div>
                          <span className="flex-shrink-0 ml-3 text-sm font-semibold text-emerald-400">
                            +{p.growthPercent}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm py-8 text-center">Pas assez de données pour cette période</p>
                )}
              </div>

              {/* Trending Down */}
              <div className="glass-card p-5">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center text-sm">📉</span>
                  Produits en Baisse
                </h3>
                {trending?.trendingDown?.length > 0 ? (
                  <>
                    <MiniBarChart
                      data={trending.trendingDown.map((p: any) => Math.abs(p.growthPercent))}
                      maxVal={Math.max(...trending.trendingDown.map((p: any) => Math.abs(p.growthPercent)))}
                      color="#EF4444"
                    />
                    <div className="mt-4 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                      {trending.trendingDown.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{p.productName}</p>
                            <p className="text-xs text-slate-500">{p.productCode}</p>
                          </div>
                          <span className="flex-shrink-0 ml-3 text-sm font-semibold text-red-400">
                            {p.growthPercent}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm py-8 text-center">Pas assez de données pour cette période</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========== FORECAST TAB ========== */}
        {!loading && activeTab === 'forecast' && (
          <div className="space-y-6 animate-fade-in-up delay-200">
            {/* At-risk counter */}
            <div className="glass-card p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">Alertes de Rupture de Stock</h3>
                <p className="text-sm text-slate-400">Produits qui risquent d&apos;être en rupture dans les {lowStock?.forecastDays || 7} prochains jours</p>
              </div>
              <div className={`text-4xl font-black px-6 py-3 rounded-2xl ${
                (lowStock?.atRiskCount || 0) > 0 ? 'bg-sky-500/15 text-red-400 animate-pulse-glow' : 'bg-emerald-500/15 text-emerald-400'
              }`}>
                {lowStock?.atRiskCount || 0}
              </div>
            </div>

            {/* Products at risk table */}
            {lowStock?.products?.length > 0 ? (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left p-4 text-xs uppercase tracking-wider text-slate-400 font-medium">Produit</th>
                        <th className="text-right p-4 text-xs uppercase tracking-wider text-slate-400 font-medium">Stock Actuel</th>
                        <th className="text-right p-4 text-xs uppercase tracking-wider text-slate-400 font-medium">Demande Prévue</th>
                        <th className="text-right p-4 text-xs uppercase tracking-wider text-slate-400 font-medium">Moy/Jour</th>
                        <th className="text-center p-4 text-xs uppercase tracking-wider text-slate-400 font-medium">Jours Restants</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {lowStock.products.map((p: any, i: number) => (
                        <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                          <td className="p-4">
                            <p className="font-medium text-white">{p.productName}</p>
                            <p className="text-xs text-slate-500">{p.productCode}</p>
                          </td>
                          <td className="p-4 text-right font-mono text-white">{p.currentStock}</td>
                          <td className="p-4 text-right font-mono text-amber-400">{p.projectedDemand}</td>
                          <td className="p-4 text-right font-mono text-slate-300">{p.dailyAverage.toFixed(2)}</td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                              p.daysLeft <= 3
                                ? 'bg-sky-500/20 text-red-300 animate-pulse'
                                : p.daysLeft <= 7
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {p.daysLeft} j
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="glass-card p-12 text-center">
                <span className="text-5xl block mb-4">✅</span>
                <h3 className="text-lg font-bold text-emerald-400">Aucune alerte de rupture</h3>
                <p className="text-slate-400 text-sm mt-1">Tous les produits ont un stock suffisant pour la période sélectionnée.</p>
              </div>
            )}
          </div>
        )}

        {/* ========== WHATSAPP TAB ========== */}
        {!loading && activeTab === 'whatsapp' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up delay-200">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-xl">💬</span>
                <div>
                  <h3 className="text-lg font-bold text-white">Envoyer une Notification WhatsApp</h3>
                  <p className="text-xs text-slate-400">Utilise l&apos;API Meta Cloud pour envoyer des messages</p>
                </div>
              </div>

              {/* Type Selector */}
              <div className="flex gap-3 mb-5">
                <button
                  onClick={() => setWaType('INVOICE')}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${
                    waType === 'INVOICE'
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                      : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:bg-slate-700/40'
                  }`}
                >
                  🧾 Facture
                </button>
                <button
                  onClick={() => setWaType('OVERDUE')}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${
                    waType === 'OVERDUE'
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:bg-slate-700/40'
                  }`}
                >
                  ⏰ Rappel Solde
                </button>
              </div>

              {/* Common Field: Phone */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Numéro de téléphone</label>
                  <input
                    type="text"
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                    placeholder="213XXXXXXXXX"
                    className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-500 transition-colors"
                  />
                </div>

                {waType === 'INVOICE' ? (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">N° Facture</label>
                      <input
                        type="text"
                        value={waInvoice}
                        onChange={(e) => setWaInvoice(e.target.value)}
                        placeholder="FAC-00123"
                        className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Montant (DA)</label>
                      <input
                        type="number"
                        value={waAmount}
                        onChange={(e) => setWaAmount(e.target.value)}
                        placeholder="150000"
                        className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-500 transition-colors"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Nom du Client</label>
                      <input
                        type="text"
                        value={waCustomerName}
                        onChange={(e) => setWaCustomerName(e.target.value)}
                        placeholder="Mohamed Ali"
                        className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Solde Restant (DA)</label>
                      <input
                        type="number"
                        value={waBalance}
                        onChange={(e) => setWaBalance(e.target.value)}
                        placeholder="85000"
                        className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-500 transition-colors"
                      />
                    </div>
                  </>
                )}

                <button
                  onClick={handleSendWhatsapp}
                  disabled={waSending || !waPhone}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    waSending || !waPhone
                      ? 'bg-slate-700/40 text-slate-500 cursor-not-allowed'
                      : 'btn-glassy hover:scale-[1.02]'
                  }`}
                >
                  {waSending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>📤 Envoyer le Message</>
                  )}
                </button>
              </div>

              {/* Result Banner */}
              {waResult && (
                <div className={`mt-4 p-4 rounded-xl border text-sm ${
                  waResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-sky-500/10 border-sky-500/30 text-red-300'
                }`}>
                  <p className="font-medium">{waResult.success ? '✅ Message envoyé avec succès' : '❌ Erreur d\'envoi'}</p>
                  {waResult.data?.message && <p className="text-xs mt-1 opacity-80">{waResult.data.message}</p>}
                  {waResult.message && !waResult.success && <p className="text-xs mt-1 opacity-80">{waResult.message}</p>}
                </div>
              )}
            </div>

            {/* WhatsApp Info Box */}
            <div className="glass-card p-5 border-l-4 border-sky-500/50">
              <h4 className="text-sm font-semibold text-sky-300 mb-2">ℹ️ Configuration WhatsApp</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pour activer l&apos;envoi réel de messages WhatsApp, configurez les variables d&apos;environnement suivantes dans le backend :
              </p>
              <div className="mt-3 bg-slate-900/60 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-1">
                <p><span className="text-sky-400">WHATSAPP_API_TOKEN</span>=votre_token_meta</p>
                <p><span className="text-sky-400">WHATSAPP_PHONE_NUMBER_ID</span>=votre_numero_id</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';

interface BillingStatus {
  isTrial: boolean;
  trialDaysLeft: number;
  planType: string;
  subscriptionStatus: string;
  trialEndDate: string;
}

export default function TenantProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip validation on auth pages
  const isPublicPage = pathname === '/login' || pathname === '/register-store';

  const fetchBilling = async () => {
    try {
      const res = await api.getBillingStatus();
      if (res.success && res.data) {
        setBilling(res.data);
      }
    } catch (e: any) {
      console.error('Failed to resolve tenant subscription status:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isPublicPage) {
      setIsLoading(false);
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchBilling();
  }, [pathname]);

  const handleSubscribe = async (planType: 'BASIC' | 'PREMIUM') => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.subscribe(planType);
      if (res.success) {
        await fetchBilling();
      } else {
        setError(res.message || 'La souscription a échoué');
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de la souscription.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Chargement de votre espace sécurisé...</p>
        </div>
      </div>
    );
  }

  // Lockout Screen if expired/suspended
  const isLockedOut = billing && 
    (billing.subscriptionStatus === 'EXPIRED' || billing.subscriptionStatus === 'SUSPENDED');

  if (isLockedOut && !isPublicPage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
        {/* Decorative background gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-red-500/[0.05] blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-teal-500/[0.05] blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="w-full max-w-3xl relative z-10 glass-card p-8 md:p-10 border-red-500/20 shadow-2xl shadow-red-950/20 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500/20 to-amber-500/20 flex items-center justify-center border border-red-500/30">
            <span className="text-4xl text-red-400">⚠️</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white mb-2">Accès Suspendu — Abonnement Requis</h1>
          <p className="text-slate-400 text-sm max-w-lg mx-auto mb-8">
            La période d&apos;essai ou l&apos;abonnement actif de votre boutique a expiré. 
            Veuillez activer un plan ci-dessous pour débloquer votre accès et retrouver vos données instantanément.
          </p>

          {error && (
            <div className="max-w-md mx-auto mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-2xl mx-auto">
            {/* Basic Plan */}
            <div className="glass-card p-6 flex flex-col justify-between border border-white/5 bg-slate-900/40">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-white text-base">Plan BASIC</h3>
                  <span className="text-sm font-black text-sky-400">4,900 DA/m</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">Essentiels pour les petits points de vente.</p>
                <ul className="space-y-1.5 text-xs text-slate-300 mb-6">
                  <li>✅ Facturation POS &amp; Ticket</li>
                  <li>✅ Gestion de stock &amp; alertes</li>
                  <li>✅ Suivi clients &amp; versements</li>
                </ul>
              </div>
              <button
                onClick={() => handleSubscribe('BASIC')}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                {submitting ? 'Activation...' : 'S&apos;abonner'}
              </button>
            </div>

            {/* Premium Plan */}
            <div className="glass-card p-6 flex flex-col justify-between border-2 border-teal-500/30 bg-teal-500/[0.02] relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-teal-500 text-slate-900 text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-bl">
                Populaire
              </div>
              <div>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-white text-base">Plan PREMIUM</h3>
                  <span className="text-sm font-black text-teal-400">9,900 DA/m</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">Toutes les fonctionnalités avancées.</p>
                <ul className="space-y-1.5 text-xs text-slate-300 mb-6">
                  <li>✅ Tout ce qui est inclus dans BASIC</li>
                  <li>✅ Analyses de marge &amp; Prévisions (BI)</li>
                  <li>✅ Notifications WhatsApp automatisées</li>
                  <li>✅ Multi-entrepôts sans limites</li>
                </ul>
              </div>
              <button
                onClick={() => handleSubscribe('PREMIUM')}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-slate-950 font-extrabold text-xs transition-colors shadow-lg shadow-teal-500/10"
              >
                {submitting ? 'Activation...' : 'S&apos;abonner'}
              </button>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5">
            <button
              onClick={() => {
                localStorage.clear();
                router.push('/login');
              }}
              className="text-xs text-slate-500 hover:text-slate-400 underline transition-colors"
            >
              Se déconnecter de la boutique
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render core children with a Trial Countdown Banner if applicable
  return (
    <>
      {billing && billing.isTrial && !isPublicPage && (
        <div className="bg-gradient-to-r from-teal-500 to-sky-600 text-slate-950 text-xs font-bold py-2.5 px-4 text-center flex items-center justify-center gap-2 relative z-50">
          <span>
            🚀 Version d&apos;essai gratuit — Il vous reste <span className="underline">{billing.trialDaysLeft} jours</span> pour utiliser l&apos;application.
          </span>
          <button
            onClick={() => router.push('/settings?tab=FACTURATION')}
            className="bg-slate-950 text-white rounded-lg px-2.5 py-1 text-[10px] hover:bg-slate-900 transition-colors uppercase tracking-wider font-extrabold"
          >
            S&apos;abonner
          </button>
        </div>
      )}
      {children}
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const errorParam = urlParams.get('error');
      if (errorParam) {
        setError(errorParam);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await api.login(email, password);

      if (response.success && response.token) {
        api.setToken(response.token);

        if (response.user) {
          localStorage.setItem('user_role', response.user.role);
          localStorage.setItem('user_name', response.user.username);
          if (response.user.permissions) {
            localStorage.setItem('user_permissions', JSON.stringify(response.user.permissions));
          } else {
            localStorage.removeItem('user_permissions');
          }
        }

        router.push('/');
      } else {
        throw new Error(response.message || 'Échec de la connexion');
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue. Veuillez réessayer.');
      console.error('Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">

      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-sky-500/[0.07] blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-teal-500/[0.05] blur-3xl animate-float" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-sky-500/[0.03] blur-3xl" />
      </div>

      {/* Login Card */}
      <div className={`w-full max-w-md relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="glass-card p-8 md:p-10">

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-24 h-24 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-sky-500/20 to-teal-500/20 flex items-center justify-center border border-white/[0.06]">
              <span className="text-5xl">🏗️</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Bienvenue</h1>
            <p className="text-slate-400 text-sm">Connectez-vous à votre espace de gestion</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Email / Nom d&apos;utilisateur
              </label>
              <input
                type="text"
                id="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all text-sm"
                placeholder="Entrez votre identifiant"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Mot de passe
              </label>
              <input
                type="password"
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all text-sm"
                placeholder="••••••••"
              />
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-sm flex items-center gap-2.5 text-red-300 animate-fade-in-up">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-glassy font-bold rounded-xl px-4 py-4 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-sm mt-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connexion...
                </>
              ) : (
                <>
                  Se connecter
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center text-xs text-slate-500">
            <p className="font-medium text-slate-400 mb-1">Ceramic ERP — Système de Gestion</p>
            <p className="mb-2">© 2025 Développé par <span className="font-medium text-slate-300">Ramy Kamil Mecheri</span>. Tous droits réservés.</p>
            <p>
              <a href="mailto:ramy.mecherim2@gmail.com" className="hover:text-sky-400 transition-colors">ramy.mecherim2@gmail.com</a>
              {' | '}
              <a href="tel:+213664975983" className="hover:text-sky-400 transition-colors">+213 664 97 59 83</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
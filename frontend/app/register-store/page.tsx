'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function RegisterStorePage() {
  const [storeName, setStoreName] = useState('');
  const [domainPrefix, setDomainPrefix] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const response = await api.registerStore({
        storeName,
        domainPrefix: domainPrefix.trim().toLowerCase(),
        username,
        password,
        email: email || undefined,
      });

      if (response.success) {
        setSuccess('Votre boutique a été créée avec succès ! Redirection vers la page de connexion...');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        throw new Error(response.message || 'Échec de la création de la boutique');
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de la création de votre boutique.');
      console.error('Registration failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-teal-500/[0.07] blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-sky-500/[0.05] blur-3xl animate-float" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-teal-500/[0.03] blur-3xl" />
      </div>

      {/* Registration Card */}
      <div className={`w-full max-w-lg relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="glass-card p-8 md:p-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 flex items-center justify-center border border-white/[0.06]">
              <span className="text-4xl">🚀</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Créer votre Espace Ceramic</h1>
            <p className="text-slate-400 text-sm">Commencez votre essai gratuit de 20 jours dès aujourd&apos;hui</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="store-name" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Nom de la boutique
                </label>
                <input
                  type="text"
                  id="store-name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  required
                  className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all text-sm"
                  placeholder="Ex: Ceramic Center"
                />
              </div>

              <div>
                <label htmlFor="domain-prefix" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Préfixe de Domaine / Identifiant
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    id="domain-prefix"
                    value={domainPrefix}
                    onChange={(e) => setDomainPrefix(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                    required
                    className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl pl-4 pr-16 py-3 text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all text-sm"
                    placeholder="ex: ceramic-center"
                  />
                  <span className="absolute right-3 text-xs text-slate-500">.erp</span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/5 my-4 pt-4">
              <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Compte Administrateur</h3>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="admin-username" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                    Nom d&apos;utilisateur Admin
                  </label>
                  <input
                    type="text"
                    id="admin-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all text-sm"
                    placeholder="Ex: admin"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="admin-email" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      Adresse Email (Optionnel)
                    </label>
                    <input
                      type="email"
                      id="admin-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all text-sm"
                      placeholder="admin@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-password" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      Mot de passe
                    </label>
                    <input
                      type="password"
                      id="admin-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-slate-800/50 border border-slate-600/40 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all text-sm"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm flex items-center gap-2.5 text-red-300 animate-fade-in-up">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Success Banner */}
            {success && (
              <div className="p-3 bg-teal-500/10 border border-teal-500/30 rounded-xl text-sm flex items-center gap-2.5 text-teal-300 animate-fade-in-up">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-teal-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-glassy font-bold rounded-xl px-4 py-3.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-sm mt-4 text-white"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Création de la boutique...
                </>
              ) : (
                <>
                  Créer ma boutique
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Footer & Redirect to Login */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              Déjà inscrit ?{' '}
              <button onClick={() => router.push('/login')} className="text-teal-400 hover:text-teal-300 font-semibold underline transition-colors">
                Connectez-vous ici
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

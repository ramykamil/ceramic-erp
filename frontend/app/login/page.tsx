'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import api from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-red-900 p-4">
      {/* Motif subtil en arrière-plan */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/95 backdrop-blur-lg p-8 md:p-10 shadow-2xl rounded-2xl border border-gray-200">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <Image
                src="/logo-allaoua-ceram.png"
                alt="Allaoua Ceram"
                fill
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Bienvenue</h1>
            <p className="text-gray-500 text-sm">Connectez-vous à votre espace de gestion</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email / Nom d&apos;utilisateur
              </label>
              <input
                type="text"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition bg-white placeholder:text-gray-400 text-gray-800"
                placeholder="Entrez votre identifiant"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition bg-white placeholder:text-gray-400 text-gray-800"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 text-white hover:bg-red-700 font-semibold rounded-lg px-4 py-3 transition duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
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

          <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
            <p className="font-medium text-gray-600 mb-1">Allaoua Ceram - Système de Gestion</p>
            <p className="mb-2">© 2025 Développé par <span className="font-medium text-gray-600">Ramy Kamil Mecheri</span>. Tous droits réservés.</p>
            <p>
              <a href="mailto:ramy.mecherim2@gmail.com" className="hover:text-red-600 transition">ramy.mecherim2@gmail.com</a>
              {' | '}
              <a href="tel:+213664975983" className="hover:text-red-600 transition">+213 664 97 59 83</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
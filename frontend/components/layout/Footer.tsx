'use client';

import { usePathname } from 'next/navigation';

export default function Footer() {
    const pathname = usePathname();

    // Ne pas afficher sur la page de connexion (elle a son propre pied de page)
    if (pathname === '/login') return null;

    return (
        <footer className="w-full py-6 mt-8 border-t border-gray-200 bg-white/50">
            <div className="max-w-7xl mx-auto px-4 text-center">
                {/* Ligne de marque */}
                <p className="text-sm text-gray-600 mb-2">
                    <span className="font-semibold text-red-600">Allaoua Ceram</span> - Système de Gestion
                </p>

                {/* Crédits développeur */}
                <div className="text-xs text-gray-400 space-y-1">
                    <p>© {new Date().getFullYear()} Développé par <span className="font-medium text-gray-600">Ramy Kamil Mecheri</span>. Tous droits réservés.</p>
                    <p className="flex items-center justify-center gap-3 flex-wrap">
                        <a
                            href="mailto:ramy.mecherim2@gmail.com"
                            className="hover:text-red-600 transition-colors inline-flex items-center gap-1"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                            ramy.mecherim2@gmail.com
                        </a>
                        <span className="text-gray-300">|</span>
                        <a
                            href="tel:+213664975983"
                            className="hover:text-red-600 transition-colors inline-flex items-center gap-1"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                            </svg>
                            +213 664 97 59 83
                        </a>
                    </p>
                </div>
            </div>
        </footer>
    );
}

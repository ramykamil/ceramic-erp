'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MobileDashboard() {
    const router = useRouter();
    const [username, setUsername] = useState<string>('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedName = localStorage.getItem('user_name');
            setUsername(storedName || 'Utilisateur');
        }
    }, []);

    const menuItems = [
        {
            title: 'Nouvelle Vente',
            icon: '🛒',
            href: '/mobile/pos',
            color: 'bg-sky-600',
        },
        {
            title: 'Commandes',
            icon: '📋',
            href: '/orders',
            color: 'bg-gray-700',
        },
        {
            title: 'Stock',
            icon: '📦',
            href: '/inventory',
            color: 'bg-sky-500',
        },
        {
            title: 'Clients',
            icon: '👥',
            href: '/customers',
            color: 'bg-gray-600',
        },
    ];

    return (
        <div className="min-h-screen p-4 pb-20">
            {/* En-tête */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Bonjour,</h1>
                    <p className="text-slate-500">{username}</p>
                </div>
                <div className="h-10 w-10 bg-sky-500/10 rounded-full flex items-center justify-center text-sky-400 font-bold">
                    {username.charAt(0).toUpperCase()}
                </div>
            </div>

            {/* Statistiques Rapides */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-900/60 p-4 rounded-xl shadow-sm shadow-black/10 border border-slate-100">
                    <div className="text-xs text-slate-400 uppercase font-semibold">Ventes du Jour</div>
                    <div className="text-xl font-bold text-slate-100 mt-1">-- DA</div>
                </div>
                <div className="bg-slate-900/60 p-4 rounded-xl shadow-sm shadow-black/10 border border-slate-100">
                    <div className="text-xs text-slate-400 uppercase font-semibold">Commandes</div>
                    <div className="text-xl font-bold text-slate-100 mt-1">--</div>
                </div>
            </div>

            {/* Menu Principal */}
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Actions Rapides</h2>
            <div className="grid grid-cols-2 gap-4">
                {menuItems.map((item) => (
                    <Link
                        key={item.title}
                        href={item.href}
                        className={`${item.color} text-white p-6 rounded-2xl shadow-lg shadow-black/20 active:scale-95 transition-transform flex flex-col items-center justify-center gap-3 aspect-square`}
                    >
                        <span className="text-4xl">{item.icon}</span>
                        <span className="font-medium text-center leading-tight">{item.title}</span>
                    </Link>
                ))}
            </div>

            {/* Navigation Mobile */}
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900/60 border-t border-white/[0.06] p-3 flex justify-around items-center text-xs text-slate-500">
                <button className="flex flex-col items-center gap-1 text-sky-400">
                    <span className="text-xl">🏠</span>
                    <span>Accueil</span>
                </button>
                <button className="flex flex-col items-center gap-1" onClick={() => router.push('/mobile/pos')}>
                    <span className="text-xl">🛒</span>
                    <span>POS</span>
                </button>
                <button className="flex flex-col items-center gap-1" onClick={() => router.push('/settings')}>
                    <span className="text-xl">⚙️</span>
                    <span>Paramètres</span>
                </button>
            </div>
        </div>
    );
}

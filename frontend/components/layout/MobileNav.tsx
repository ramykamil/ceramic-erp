'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MobileNav() {
  const pathname = usePathname();

  // Ne pas afficher sur la page de connexion, POS, ou Retours
  if (pathname === '/login' || pathname.startsWith('/sales/pos') || pathname.startsWith('/sales/returns')) return null;

  const isActive = (path: string) => pathname === path ? 'text-sky-400 font-semibold' : 'text-slate-500';

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-xl border-t border-white/[0.06] h-16 flex justify-around items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
      <Link href="/" className={`flex flex-col items-center text-xs ${isActive('/')}`}>
        <span className="text-xl">🏠</span>
        <span>Accueil</span>
      </Link>
      <Link href="/sales/pos" className={`flex flex-col items-center text-xs ${isActive('/sales/pos')}`}>
        <div className="bg-gradient-to-br from-sky-500 to-teal-500 rounded-full p-2 -mt-6 border-4 border-slate-950 shadow-lg shadow-sky-500/20">
          <span className="text-white text-xl">🛒</span>
        </div>
        <span className="font-bold text-sky-400 mt-1">Vente</span>
      </Link>
      <Link href="/inventory" className={`flex flex-col items-center text-xs ${isActive('/inventory')}`}>
        <span className="text-xl">📦</span>
        <span>Stock</span>
      </Link>
      <Link href="/customers" className={`flex flex-col items-center text-xs ${isActive('/customers')}`}>
        <span className="text-xl">👥</span>
        <span>Clients</span>
      </Link>
    </div>
  );
}

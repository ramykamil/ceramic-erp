'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MobileNav() {
  const pathname = usePathname();

  // Ne pas afficher sur la page de connexion
  if (pathname === '/login') return null;

  const isActive = (path: string) => pathname === path ? 'text-red-600 font-semibold' : 'text-gray-500';

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex justify-around items-center z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
      <Link href="/" className={`flex flex-col items-center text-xs ${isActive('/')}`}>
        <span className="text-xl">🏠</span>
        <span>Accueil</span>
      </Link>
      <Link href="/sales/pos" className={`flex flex-col items-center text-xs ${isActive('/sales/pos')}`}>
        <div className="bg-red-600 rounded-full p-2 -mt-6 border-4 border-white shadow-lg">
          <span className="text-white text-xl">🛒</span>
        </div>
        <span className="font-bold text-red-700 mt-1">Vente</span>
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

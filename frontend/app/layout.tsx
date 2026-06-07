import "./globals.css";

import { ToastProvider } from "@/components/ui/Toast";
import MobileNav from "@/components/layout/MobileNav";
import Footer from "@/components/layout/Footer";
import GlobalKeyboardShortcuts from "@/components/GlobalKeyboardShortcuts";

export const metadata = {
  title: "Ceramic ERP - Système de Gestion",
  description: "Système de gestion pour Ceramic ERP - Carrelages et céramiques",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans flex flex-col">
        <ToastProvider>
          {/* Global Keyboard Shortcuts (ESC to go back) */}
          <GlobalKeyboardShortcuts />
          {/* Main content area */}
          <div className="relative flex-1 pb-20 md:pb-0">
            {children}
          </div>
          {/* Global Footer with developer credits */}
          <Footer />
          {/* Mobile Navigation */}
          <MobileNav />
        </ToastProvider>
      </body>
    </html>
  );
}

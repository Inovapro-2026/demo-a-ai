import React from 'react';
import { Lock, ShoppingBag } from 'lucide-react';
import type { StoreSettings } from '../../types/domain.ts';

interface StoreHeaderProps {
  settings: StoreSettings;
  cartCount: number;
  onOpenCart: () => void;
  onNavigateSection: (sectionId: string) => void;
  onOpenCatalog: () => void;
  onOpenTracking: () => void;
  onOpenAdmin: () => void;
}

export const StoreHeader: React.FC<StoreHeaderProps> = ({
  settings,
  cartCount,
  onOpenCart,
  onNavigateSection,
  onOpenCatalog,
  onOpenTracking,
  onOpenAdmin,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-[#781B68]/12 bg-white/92 backdrop-blur-md">
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between gap-2 sm:gap-8 px-3 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigateSection('topo');
          }}
          className="flex min-w-0 items-center gap-2 sm:gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]"
        >
          <img
            src={settings.logoUrl || '/assets/aistudio/image_332d0e8c.png'}
            alt={settings.storeName}
            referrerPolicy="no-referrer"
            className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full object-cover ring-2 ring-[#781B68]/25 bg-white shadow-sm"
          />
          <span className="font-display text-base sm:text-xl font-bold tracking-tight text-[#310D2B] truncate">
            {settings.storeName}
          </span>
        </a>

        {/* Zone 2: 4 concise single-line text links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-[#3D2E35]">
          <a
            href="#carrosseis"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSection('carrosseis');
            }}
            className="hover:text-[#781B68] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Destaques
          </a>
          <a
            href="/cardapio"
            onClick={(e) => {
              e.preventDefault();
              onOpenCatalog();
            }}
            className="hover:text-[#781B68] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Cardápio
          </a>
          <a
            href="#avaliacoes"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSection('avaliacoes');
            }}
            className="hover:text-[#781B68] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Avaliações
          </a>
          <button
            type="button"
            onClick={onOpenTracking}
            className="hover:text-[#781B68] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Pedidos
          </button>
        </nav>

        {/* Zone 3: Sacola CTA & Admin Access */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="da-btn-3d inline-flex min-h-[40px] items-center gap-1.5 sm:gap-2.5 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            aria-label={`Abrir sacola com ${cartCount} itens`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Sacola</span>
            <span className="font-mono-tabular rounded-lg bg-[#E6AE52] px-1.5 py-0.5 text-xs font-bold text-[#310D2B]">
              {cartCount}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#781B68]/25 bg-[#FFF5EB] px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#4A123F] shadow-sm transition hover:border-[#781B68]/50 hover:bg-[#781B68]/10 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Abrir painel administrativo"
          >
            <Lock className="h-3.5 w-3.5 text-[#781B68]" />
            <span>Admin</span>
          </button>
        </div>
      </div>
    </header>
  );
};

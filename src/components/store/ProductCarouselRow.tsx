import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Product } from '../../types/domain.ts';
import type { ProductRatingSummary } from '../../hooks/useStoreData.tsx';
import { ScrollReveal } from '../motion/ScrollReveal.tsx';
import { ProductCard } from './ProductCard.tsx';

interface ProductCarouselRowProps {
  title: string;
  subtitle?: string;
  products: Product[];
  favorites: string[];
  ratingStatsByProduct?: Record<string, ProductRatingSummary>;
  onToggleFavorite: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onViewAll: () => void;
  delayMs?: number;
}

export const ProductCarouselRow: React.FC<ProductCarouselRowProps> = ({
  title,
  subtitle,
  products,
  favorites,
  ratingStatsByProduct,
  onToggleFavorite,
  onSelectProduct,
  onViewAll,
  delayMs = 0,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const limitedProducts = products.slice(0, 6);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 8);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState, { passive: true });
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState, limitedProducts.length]);

  const scrollByDirection = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = Math.max(260, Math.round(el.clientWidth * 0.72));
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  if (limitedProducts.length === 0) return null;

  return (
    <ScrollReveal delayMs={delayMs}>
      <section className="relative space-y-3">
        {/* Category Header + Ver todos link */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#310D2B] truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs sm:text-sm text-[#5C4952] truncate">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop Scroll Controls */}
            <div className="hidden md:flex items-center gap-1.5 mr-1">
              <button
                type="button"
                onClick={() => scrollByDirection('left')}
                disabled={!canScrollLeft}
                aria-label={`Rolar ${title} para a esquerda`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#781B68]/20 bg-white text-[#4A123F] shadow-xs transition hover:border-[#781B68] disabled:opacity-35 disabled:cursor-default cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollByDirection('right')}
                disabled={!canScrollRight}
                aria-label={`Rolar ${title} para a direita`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#781B68]/20 bg-white text-[#4A123F] shadow-xs transition hover:border-[#781B68] disabled:opacity-35 disabled:cursor-default cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onViewAll}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl px-2 py-1 text-xs sm:text-sm font-bold text-[#781B68] hover:text-[#4A123F] hover:bg-[#781B68]/8 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Ver todos</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Independent Horizontal Scroll Track (Snap + Touch Swipe + Continuity Indicator) */}
        <div className="relative">
          <div
            ref={scrollerRef}
            onScroll={updateScrollState}
            className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory scroll-smooth no-scrollbar touch-pan-x pb-3 pt-1 px-0.5"
          >
            {limitedProducts.map((product) => {
              const stat = ratingStatsByProduct?.[product.id];
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  variant="compact"
                  isCarouselItem
                  isFavorite={favorites.includes(product.id)}
                  ratingAvg={stat?.avg}
                  ratingCount={stat?.count}
                  onToggleFavorite={onToggleFavorite}
                  onSelect={onSelectProduct}
                />
              );
            })}
          </div>

          {/* Right Continuity Visual Cue when horizontal overflow exists */}
          {canScrollRight && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-0 bottom-3 w-8 bg-gradient-to-l from-[#FFF5EB] via-[#FFF5EB]/70 to-transparent"
            />
          )}
        </div>
      </section>
    </ScrollReveal>
  );
};

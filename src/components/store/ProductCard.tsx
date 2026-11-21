import React, { useState } from 'react';
import { Heart, Plus, Star } from 'lucide-react';
import type { Product } from '../../types/domain.ts';
import { formatBRL } from '../../lib/formatters.ts';

interface ProductCardProps {
  product: Product;
  variant?: 'default' | 'compact';
  isCarouselItem?: boolean;
  isFavorite?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  onToggleFavorite?: (productId: string) => void;
  onSelect: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  variant = 'compact',
  isCarouselItem = false,
  isFavorite = false,
  ratingAvg,
  ratingCount,
  onToggleFavorite,
  onSelect,
}) => {
  const [imgError, setImgError] = useState(false);
  const displayRatingAvg = typeof ratingAvg === 'number' ? ratingAvg : product.ratingAvg || 0;
  const displayRatingCount = typeof ratingCount === 'number' ? ratingCount : product.ratingCount || 0;

  const hasPromo =
    typeof product.promoPrice === 'number' &&
    product.promoPrice > 0 &&
    product.promoPrice < product.price;
  const activePrice = hasPromo ? (product.promoPrice as number) : product.price;
  const discountPct = hasPromo
    ? Math.max(1, Math.round(((product.price - activePrice) / product.price) * 100))
    : 0;

  let highlightLabel: string | null = null;
  if (hasPromo) highlightLabel = `-${discountPct}% OFF`;
  else if (product.bestSeller) highlightLabel = 'Mais vendido';
  else if (product.isNew) highlightLabel = 'Novidade';

  if (variant === 'compact') {
    return (
      <article
        onClick={() => product.available && onSelect(product)}
        className={`da-card-3d da-card-3d-interactive group flex flex-col overflow-hidden rounded-2xl ${
          isCarouselItem
            ? 'w-[154px] sm:w-[196px] lg:w-[222px] shrink-0 snap-start'
            : 'w-full min-w-0'
        } ${product.available ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
      >
        {/* Compact Photo Frame: ~118px height on mobile, proportional on tablet/desktop */}
        <div className="relative h-[118px] sm:h-[144px] lg:h-[158px] w-full overflow-hidden bg-[#FFF5EB]">
          {!imgError && product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#4A123F]/12 to-[#E6AE52]/20 p-3 text-center">
              <span className="font-display text-sm font-bold text-[#4A123F] line-clamp-2">
                {product.name}
              </span>
            </div>
          )}

          {/* Single clean top-left spotlight / promo tag */}
          {highlightLabel && (
            <span
              className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-tight shadow-sm ${
                hasPromo
                  ? 'bg-[#E6AE52] text-[#310D2B]'
                  : 'bg-[#4A123F]/90 text-white backdrop-blur-xs'
              }`}
            >
              {highlightLabel}
            </span>
          )}

          {/* Compact Top-Right Favorite Toggle with comfortable touch target */}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(product.id);
              }}
              aria-label={
                isFavorite
                  ? `Remover ${product.name} dos favoritos`
                  : `Favoritar ${product.name}`
              }
              className={`absolute right-1.5 top-1.5 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full shadow-md transition active:scale-90 cursor-pointer ${
                isFavorite
                  ? 'bg-[#4A123F] text-[#E6AE52]'
                  : 'bg-white/92 text-[#4A123F] hover:bg-white'
              }`}
            >
              <Heart className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isFavorite ? 'fill-[#E6AE52]' : ''}`} />
            </button>
          )}

          {!product.available && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#310D2B]/65 backdrop-blur-[1px] p-2">
              <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-[#310D2B] shadow-sm text-center">
                Indisponível
              </span>
            </div>
          )}
        </div>

        {/* Compact Details */}
        <div className="flex flex-1 flex-col justify-between p-2 sm:p-3.5">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-medium text-[#5C4952]">
              <span className="truncate">{product.categoryName}</span>
              {displayRatingCount > 0 && (
                <span className="inline-flex items-center gap-0.5 font-mono-tabular font-semibold text-[#4A123F] shrink-0">
                  <Star className="h-3 w-3 fill-[#E6AE52] text-[#E6AE52]" />
                  <span>{displayRatingAvg.toFixed(1)}</span>
                  <span className="hidden sm:inline text-[10px] text-[#5C4952]">
                    ({displayRatingCount})
                  </span>
                </span>
              )}
            </div>

            <h3 className="mt-1 line-clamp-2 min-h-[2.3em] text-[12.5px] sm:text-sm font-bold text-[#1A1216] leading-tight group-hover:text-[#4A123F] transition-colors">
              {product.name}
            </h3>

            <p className="mt-1 line-clamp-2 text-[11px] sm:text-xs text-[#5C4952] leading-snug">
              {product.description}
            </p>
          </div>

          <div className="mt-2.5 flex items-end justify-between gap-1 border-t border-[#781B68]/10 pt-2">
            <div className="flex flex-col min-w-0">
              {hasPromo && (
                <span className="font-mono-tabular text-[10px] text-[#6B5A62] line-through leading-none">
                  {formatBRL(product.price)}
                </span>
              )}
              <span className="font-mono-tabular text-[13px] sm:text-base font-extrabold text-[#4A123F] leading-tight">
                {formatBRL(activePrice)}
              </span>
            </div>

            <button
              type="button"
              disabled={!product.available}
              onClick={(e) => {
                e.stopPropagation();
                if (product.available) onSelect(product);
              }}
              aria-label={
                product.allowAddons ? `Personalizar ${product.name}` : `Adicionar ${product.name}`
              }
              className="da-btn-gold inline-flex h-7 sm:h-9 items-center gap-0.5 sm:gap-1 rounded-xl px-2 sm:px-3 text-[10.5px] sm:text-xs font-bold disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 stroke-[2.5]" />
              <span>{product.allowAddons ? 'Montar' : 'Add'}</span>
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={() => product.available && onSelect(product)}
      className={`da-card-3d da-card-3d-interactive group flex flex-col overflow-hidden rounded-3xl ${
        product.available ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'
      }`}
    >
      {/* Large 4:3 Appetizing Product Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#FFF5EB]">
        {!imgError && product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#4A123F]/12 to-[#E6AE52]/20 p-4 text-center">
            <span className="font-display text-lg font-bold text-[#4A123F]">{product.name}</span>
          </div>
        )}

        {highlightLabel && (
          <span
            className={`absolute left-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-tight shadow-sm ${
              hasPromo
                ? 'bg-[#E6AE52] text-[#310D2B]'
                : 'bg-[#4A123F]/90 text-white backdrop-blur-xs'
            }`}
          >
            {highlightLabel}
          </span>
        )}

        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(product.id);
            }}
            aria-label={
              isFavorite
                ? `Remover ${product.name} dos favoritos`
                : `Favoritar ${product.name}`
            }
            className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full shadow-md transition active:scale-90 cursor-pointer ${
              isFavorite
                ? 'bg-[#4A123F] text-[#E6AE52]'
                : 'bg-white/90 text-[#4A123F] hover:bg-white'
            }`}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-[#E6AE52]' : ''}`} />
          </button>
        )}

        {!product.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#310D2B]/65 backdrop-blur-[1px]">
            <span className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-[#310D2B] shadow-md">
              Indisponível no momento
            </span>
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-[#5C4952]">
            <span className="truncate">{product.categoryName}</span>
            {displayRatingCount > 0 && (
              <span className="inline-flex items-center gap-1 font-mono-tabular font-semibold text-[#4A123F] shrink-0">
                <Star className="h-3.5 w-3.5 fill-[#E6AE52] text-[#E6AE52]" />
                {displayRatingAvg.toFixed(1)} ({displayRatingCount})
              </span>
            )}
          </div>

          <h3 className="mt-1.5 text-base sm:text-[17px] font-bold text-[#1A1216] leading-snug group-hover:text-[#4A123F] transition-colors">
            {product.name}
          </h3>

          <p className="mt-1.5 line-clamp-2 text-xs sm:text-sm text-[#4A3B42] leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#781B68]/10 pt-3.5">
          <div className="flex flex-col">
            {hasPromo && (
              <span className="font-mono-tabular text-[11px] text-[#6B5A62] line-through leading-none">
                {formatBRL(product.price)}
              </span>
            )}
            <span className="font-mono-tabular text-lg font-extrabold text-[#4A123F]">
              {formatBRL(activePrice)}
            </span>
          </div>

          <button
            type="button"
            disabled={!product.available}
            onClick={(e) => {
              e.stopPropagation();
              if (product.available) onSelect(product);
            }}
            aria-label={product.allowAddons ? `Personalizar ${product.name}` : `Adicionar ${product.name}`}
            className="da-btn-gold inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>{product.allowAddons ? 'Montar' : 'Adicionar'}</span>
          </button>
        </div>
      </div>
    </article>
  );
};

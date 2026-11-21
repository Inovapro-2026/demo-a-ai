import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { Addon, AddonGroup, Category, Product } from '../../types/domain.ts';
import type { ProductRatingSummary } from '../../hooks/useStoreData.tsx';
import { formatBRL } from '../../lib/formatters.ts';
import { ScrollReveal } from '../motion/ScrollReveal.tsx';
import { ProductCard } from './ProductCard.tsx';

const PAGE_SIZE = 12;

const ADDON_GROUP_LABELS: Record<AddonGroup, string> = {
  cremes: 'Cremes Especiais',
  frutas: 'Frutas Frescas',
  caldas: 'Caldas Artesanais',
  crocantes: 'Crocantes e Granola',
  especiais: 'Complementos Especiais',
};

type PriceFilter = 'all' | 'up_to_25' | '25_to_40' | 'above_40';
type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'popular' | 'rating_desc';

interface FullCatalogViewProps {
  products: Product[];
  categories: Category[];
  addons: Addon[];
  favorites: string[];
  ratingStatsByProduct?: Record<string, ProductRatingSummary>;
  initialCategoryId?: string;
  onToggleFavorite: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onBackToHome: () => void;
}

function getEffectivePrice(p: Product): number {
  return typeof p.promoPrice === 'number' && p.promoPrice > 0 && p.promoPrice < p.price
    ? p.promoPrice
    : p.price;
}

export const FullCatalogView: React.FC<FullCatalogViewProps> = ({
  products,
  categories,
  addons,
  favorites,
  ratingStatsByProduct,
  initialCategoryId = 'all',
  onToggleFavorite,
  onSelectProduct,
  onBackToHome,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryId);
  const [searchTerm, setSearchTerm] = useState('');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [visibleLimit, setVisibleLimit] = useState<number>(PAGE_SIZE);

  useEffect(() => {
    setSelectedCategory(initialCategoryId || 'all');
    setVisibleLimit(PAGE_SIZE);
  }, [initialCategoryId]);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [selectedCategory, searchTerm, priceFilter, sortBy]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active),
    [categories]
  );

  const availableAddons = useMemo(() => addons.filter((a) => a.available), [addons]);

  const customizableAcaiProduct = useMemo(
    () => products.find((p) => p.available && p.allowAddons) || products[0] || null,
    [products]
  );

  const filteredAndSortedProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    const filtered = products.filter((p) => {
      if (q) {
        const matchesQuery =
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      if (selectedCategory === 'favorites') {
        if (!favorites.includes(p.id)) return false;
      } else if (selectedCategory === 'bestSeller') {
        if (!p.bestSeller) return false;
      } else if (selectedCategory === 'promocoes') {
        const isPromo =
          p.categoryId === 'cat_promocoes' ||
          (typeof p.promoPrice === 'number' && p.promoPrice > 0 && p.promoPrice < p.price);
        if (!isPromo) return false;
      } else if (selectedCategory !== 'all' && selectedCategory !== 'adicionais') {
        if (p.categoryId !== selectedCategory) return false;
      }

      const activePrice = getEffectivePrice(p);
      if (priceFilter === 'up_to_25' && activePrice > 25) return false;
      if (priceFilter === '25_to_40' && (activePrice < 25 || activePrice > 40)) return false;
      if (priceFilter === 'above_40' && activePrice <= 40) return false;

      return true;
    });

    const sorted = [...filtered];
    if (sortBy === 'price_asc') {
      sorted.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
    } else if (sortBy === 'price_desc') {
      sorted.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
    } else if (sortBy === 'rating_desc') {
      sorted.sort((a, b) => {
        const statA = ratingStatsByProduct?.[a.id] || {
          avg: a.ratingAvg || 0,
          count: a.ratingCount || 0,
        };
        const statB = ratingStatsByProduct?.[b.id] || {
          avg: b.ratingAvg || 0,
          count: b.ratingCount || 0,
        };
        if (statB.avg !== statA.avg) return statB.avg - statA.avg;
        return statB.count - statA.count;
      });
    } else if (sortBy === 'popular') {
      sorted.sort((a, b) => {
        const statA = ratingStatsByProduct?.[a.id] || {
          avg: a.ratingAvg || 0,
          count: a.ratingCount || 0,
        };
        const statB = ratingStatsByProduct?.[b.id] || {
          avg: b.ratingAvg || 0,
          count: b.ratingCount || 0,
        };
        const scoreA = (a.bestSeller ? 1000 : 0) + statA.count * 10 + statA.avg;
        const scoreB = (b.bestSeller ? 1000 : 0) + statB.count * 10 + statB.avg;
        return scoreB - scoreA;
      });
    } else {
      sorted.sort((a, b) => {
        const availDiff = Number(b.available) - Number(a.available);
        if (availDiff !== 0) return availDiff;
        return Number(b.featured) - Number(a.featured);
      });
    }

    return sorted;
  }, [products, searchTerm, selectedCategory, favorites, priceFilter, sortBy, ratingStatsByProduct]);

  const paginatedProducts = useMemo(
    () => filteredAndSortedProducts.slice(0, visibleLimit),
    [filteredAndSortedProducts, visibleLimit]
  );

  const hasMore = paginatedProducts.length < filteredAndSortedProducts.length;
  const remainingCount = filteredAndSortedProducts.length - paginatedProducts.length;

  return (
    <div className="mx-auto max-w-7xl px-3.5 py-5 sm:px-6 lg:px-8 space-y-5">
      {/* Top Navigation & Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex min-h-[36px] items-center gap-1.5 text-xs sm:text-sm font-bold text-[#781B68] hover:text-[#4A123F] transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar para início</span>
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#310D2B]">
            Cardápio Completo
          </h1>
          <p className="text-xs sm:text-sm text-[#4A3B42]">
            Explore todos os produtos disponíveis, filtre por categoria, preço ou popularidade.
          </p>
        </div>

        <span className="font-mono-tabular text-xs font-bold text-[#4A123F]">
          {selectedCategory === 'adicionais'
            ? `${availableAddons.length} adicionais disponíveis`
            : `${filteredAndSortedProducts.length} produtos encontrados`}
        </span>
      </div>

      {/* Search + Price & Sort Controls */}
      <div className="da-card-3d rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
          <div className="relative md:col-span-6">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#781B68]" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (e.target.value.trim().length > 0 && selectedCategory === 'adicionais') {
                  setSelectedCategory('all');
                }
              }}
              placeholder="Buscar produto, ingrediente ou sabor..."
              className="w-full rounded-xl border border-[#781B68]/20 bg-[#FFF5EB]/45 py-2.5 pl-10 pr-3 text-sm text-[#1A1216] placeholder:text-[#6D5A63] focus:border-[#781B68] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 md:col-span-6">
            <div className="relative">
              <label htmlFor="catalog-price-filter" className="sr-only">
                Filtrar por preço
              </label>
              <select
                id="catalog-price-filter"
                value={priceFilter}
                onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
                className="w-full min-h-[42px] rounded-xl border border-[#781B68]/20 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-[#310D2B] focus:border-[#781B68] focus:outline-none"
              >
                <option value="all">Todos os preços</option>
                <option value="up_to_25">Até R$ 25,00</option>
                <option value="25_to_40">De R$ 25 a R$ 40</option>
                <option value="above_40">Acima de R$ 40</option>
              </select>
            </div>

            <div className="relative flex items-center">
              <SlidersHorizontal className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#781B68]" />
              <label htmlFor="catalog-sort" className="sr-only">
                Ordenar produtos
              </label>
              <select
                id="catalog-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full min-h-[42px] rounded-xl border border-[#781B68]/20 bg-white pl-8 pr-3 py-2 text-xs sm:text-sm font-semibold text-[#310D2B] focus:border-[#781B68] focus:outline-none"
              >
                <option value="relevance">Relevância</option>
                <option value="rating_desc">Melhor avaliados</option>
                <option value="popular">Mais populares</option>
                <option value="price_asc">Menor preço</option>
                <option value="price_desc">Maior preço</option>
              </select>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs (Horizontal Scroll on Mobile, Clean Wrap on Desktop) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 pt-0.5">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'bestSeller', label: 'Mais vendidos' },
            ...activeCategories.map((c) => ({
              id: c.slug === 'promocoes' ? 'promocoes' : c.id,
              label: c.name,
            })),
            ...(availableAddons.length > 0 ? [{ id: 'adicionais', label: 'Adicionais' }] : []),
          ].map((tab) => {
            const active = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`min-h-[36px] rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${
                  active
                    ? 'da-btn-3d text-white'
                    : 'border border-[#781B68]/15 bg-[#FFF5EB]/65 text-[#4A123F] hover:border-[#781B68]/35'
                }`}
              >
                {tab.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setSelectedCategory((prev) => (prev === 'favorites' ? 'all' : 'favorites'))
            }
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${
              selectedCategory === 'favorites'
                ? 'bg-[#310D2B] text-[#E6AE52] shadow-sm'
                : 'border border-[#781B68]/15 bg-[#FFF5EB]/65 text-[#4A123F] hover:border-[#781B68]/35'
            }`}
          >
            <Heart
              className={`h-3.5 w-3.5 ${
                selectedCategory === 'favorites' ? 'fill-[#E6AE52] text-[#E6AE52]' : ''
              }`}
            />
            <span>Favoritos ({favorites.length})</span>
          </button>
        </div>
      </div>

      {/* Results Area */}
      {selectedCategory === 'adicionais' ? (
        <div className="space-y-5">
          <div className="da-card-3d rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A123F] text-[#E6AE52] shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#310D2B]">
                  Adicionais & Complementos Fresquinhos
                </h2>
                <p className="text-xs sm:text-sm text-[#4A3B42]">
                  Escolha uma tigela ou copo e adicione quantos complementos quiser na montagem.
                </p>
              </div>
            </div>

            {customizableAcaiProduct && (
              <button
                type="button"
                onClick={() => onSelectProduct(customizableAcaiProduct)}
                className="da-btn-gold inline-flex min-h-[40px] items-center gap-2 rounded-2xl px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Montar meu Açaí</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.keys(ADDON_GROUP_LABELS) as AddonGroup[]).map((groupKey) => {
              const groupAddons = availableAddons.filter((a) => a.group === groupKey);
              if (groupAddons.length === 0) return null;
              return (
                <div key={groupKey} className="da-card-3d rounded-2xl p-4 sm:p-5 space-y-2.5">
                  <h3 className="font-display text-lg font-bold text-[#4A123F]">
                    {ADDON_GROUP_LABELS[groupKey]}
                  </h3>
                  <ul className="divide-y divide-[#781B68]/10">
                    {groupAddons.map((addon) => (
                      <li
                        key={addon.id}
                        className="flex items-center justify-between py-2 text-xs sm:text-sm"
                      >
                        <span className="font-medium text-[#1A1216]">{addon.name}</span>
                        <span className="font-mono-tabular font-bold text-[#781B68]">
                          {addon.price > 0 ? `+ ${formatBRL(addon.price)}` : 'Grátis'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : paginatedProducts.length === 0 ? (
        <div className="da-card-3d rounded-3xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-[#5C4952]">
            {selectedCategory === 'favorites'
              ? 'Você ainda não marcou nenhum produto como favorito.'
              : 'Nenhum produto encontrado com esses filtros.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSearchTerm('');
              setPriceFilter('all');
              setSortBy('relevance');
            }}
            className="da-btn-3d inline-flex rounded-xl px-4 py-2 text-xs font-bold cursor-pointer"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 2 Columns on Mobile -> 3 on Tablet -> 4-5 on Desktop */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
            {paginatedProducts.map((product, idx) => {
              const stat = ratingStatsByProduct?.[product.id];
              return (
                <ScrollReveal key={product.id} delayMs={(idx % 4) * 45}>
                  <ProductCard
                    product={product}
                    variant="compact"
                    isFavorite={favorites.includes(product.id)}
                    ratingAvg={stat?.avg}
                    ratingCount={stat?.count}
                    onToggleFavorite={onToggleFavorite}
                    onSelect={onSelectProduct}
                  />
                </ScrollReveal>
              );
            })}
          </div>

          {/* Progressive Loading / Pagination Controls */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <span className="font-mono-tabular text-xs text-[#5C4952]">
              Exibindo {paginatedProducts.length} de {filteredAndSortedProducts.length} produtos
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                className="da-btn-3d inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-6 py-2.5 text-xs sm:text-sm font-bold cursor-pointer"
              >
                Carregar mais produtos ({Math.min(PAGE_SIZE, remainingCount)})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

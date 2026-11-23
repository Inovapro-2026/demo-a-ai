import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ClipboardList,
  Heart,
  Home,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  MessageCircle,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  UserCheck,
} from 'lucide-react';
import type {
  CartItem,
  Coupon,
  LocalTrackedOrderRef,
  Product,
} from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { useStoreData } from '../../hooks/useStoreData.tsx';
import { formatDateBR } from '../../lib/formatters.ts';
import { ScrollReveal } from '../motion/ScrollReveal.tsx';
import { CartDrawer } from './CartDrawer.tsx';
import { CheckoutModal } from './CheckoutModal.tsx';
import { CustomerChatWidget } from './CustomerChatWidget.tsx';
import { FullCatalogView } from './FullCatalogView.tsx';
import { OrderTrackingView } from './OrderTrackingView.tsx';
import { ProductCard } from './ProductCard.tsx';
import { ProductCarouselRow } from './ProductCarouselRow.tsx';
import { ProductCustomizerModal } from './ProductCustomizerModal.tsx';
import { StoreHeader } from './StoreHeader.tsx';
import { StoreHero } from './StoreHero.tsx';

const TRACKING_STORAGE_KEY = 'dois_amores_tracked_orders';
const FAVORITES_STORAGE_KEY = 'dois_amores_favorites';

interface StorefrontPageProps {
  activePage: 'home' | 'catalog';
  catalogCategoryHint: string;
  onNavigateHome: () => void;
  onNavigateCatalog: (categoryId?: string) => void;
  onOpenAdmin: () => void;
}

export const StorefrontPage: React.FC<StorefrontPageProps> = ({
  activePage,
  catalogCategoryHint,
  onNavigateHome,
  onNavigateCatalog,
  onOpenAdmin,
}) => {
  const { user, signInWithGoogle, logout } = useAuth();
  const {
    settings,
    categories,
    products,
    addons,
    approvedReviews,
    ratingStatsByProduct,
    loading,
  } = useStoreData();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [viewMode, setViewMode] = useState<'store' | 'tracking'>('store');
  const [trackedRefs, setTrackedRefs] = useState<LocalTrackedOrderRef[]>(() => {
    try {
      const raw = localStorage.getItem(TRACKING_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LocalTrackedOrderRef[]) : [];
    } catch {
      return [];
    }
  });
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>(
    trackedRefs[0]?.trackingId || null
  );

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // ignore storage quota errors
    }
  }, [favorites]);

  const toggleFavorite = (productId: string) => {
    setFavorites((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active),
    [categories]
  );

  const visibleProducts = useMemo(
    () => products.filter((p) => !p.archived),
    [products]
  );

  const promoShowcaseProduct = useMemo(() => {
    return (
      visibleProducts.find(
        (p) => p.available && typeof p.promoPrice === 'number' && p.promoPrice > 0 && p.promoPrice < p.price
      ) || visibleProducts.find((p) => p.available) || null
    );
  }, [visibleProducts]);

  const availableAddons = useMemo(() => addons.filter((a) => a.available), [addons]);

  // Quick Home search / favorites filter
  const isHomeQuickFiltering = searchTerm.trim().length > 0 || onlyFavorites;
  const homeFilteredProducts = useMemo(() => {
    if (!isHomeQuickFiltering) return [];
    const q = searchTerm.trim().toLowerCase();
    return visibleProducts.filter((p) => {
      if (onlyFavorites && !favorites.includes(p.id)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
      );
    });
  }, [isHomeQuickFiltering, visibleProducts, onlyFavorites, favorites, searchTerm]);

  // Up to 5 independent horizontal carousel rows built strictly from real database categories & products
  const carouselRows = useMemo(() => {
    const rows: Array<{
      id: string;
      title: string;
      subtitle: string;
      filterId: string;
      products: Product[];
    }> = [];

    const bestSellers = visibleProducts.filter((p) => p.bestSeller);
    if (bestSellers.length > 0) {
      rows.push({
        id: 'row-best-sellers',
        title: 'Mais vendidos',
        subtitle: 'Os favoritos dos clientes Dois Amores',
        filterId: 'bestSeller',
        products: bestSellers.slice(0, 6),
      });
    }

    for (const cat of activeCategories) {
      if (rows.length >= 5) break;
      const isPromoCategory = cat.slug === 'promocoes' || cat.id === 'cat_promocoes';
      const catProducts = visibleProducts.filter((p) =>
        isPromoCategory
          ? p.categoryId === cat.id ||
            (typeof p.promoPrice === 'number' && p.promoPrice > 0 && p.promoPrice < p.price)
          : p.categoryId === cat.id
      );

      if (catProducts.length > 0) {
        rows.push({
          id: `row-${cat.id}`,
          title: cat.name,
          subtitle: cat.description || `Seleção especial de ${cat.name}`,
          filterId: isPromoCategory ? 'promocoes' : cat.id,
          products: catProducts.slice(0, 6),
        });
      }
    }

    if (rows.length < 5 && !rows.some((r) => r.filterId === 'promocoes')) {
      const promoProducts = visibleProducts.filter(
        (p) => typeof p.promoPrice === 'number' && p.promoPrice > 0 && p.promoPrice < p.price
      );
      if (promoProducts.length > 0) {
        rows.push({
          id: 'row-promocoes',
          title: 'Promoções',
          subtitle: 'Ofertas com preço especial por tempo limitado',
          filterId: 'promocoes',
          products: promoProducts.slice(0, 6),
        });
      }
    }

    return rows.slice(0, 5);
  }, [visibleProducts, activeCategories]);

  // Circular category strip items built from real Firestore categories + Adicionais shortcut
  const categoryBubbles = useMemo(() => {
    const getCategoryImage = (slugOrId: string, catId?: string): string => {
      const matchedProd = visibleProducts.find(
        (p) => p.categoryId === catId && Boolean(p.imageUrl)
      );
      if (matchedProd?.imageUrl) return matchedProd.imageUrl;
      if (slugOrId.includes('tigela')) return '/src/assets/images/product_acai_tigela_1795280701252.jpg';
      if (slugOrId.includes('copo')) return '/src/assets/images/product_acai_copo_1795280701279.jpg';
      if (slugOrId.includes('sorvete')) return '/src/assets/images/product_sorvete_waffle_1795280701446.jpg';
      if (slugOrId.includes('combo')) return '/src/assets/images/product_combo_casal_1795280700984.jpg';
      return settings.bannerUrl || '/src/assets/images/hero_acai_banner_1795280701199.jpg';
    };

    const items: Array<{ id: string; label: string; imageUrl: string; isAddonTab?: boolean }> = [
      {
        id: 'all',
        label: 'Todos',
        imageUrl: settings.logoUrl || '/assets/aistudio/image_332d0e8c.png',
      },
      ...activeCategories.map((cat) => ({
        id: cat.slug === 'promocoes' ? 'promocoes' : cat.id,
        label: cat.name,
        imageUrl: getCategoryImage(cat.slug, cat.id),
      })),
    ];

    if (availableAddons.length > 0 && !items.some((i) => i.id === 'adicionais')) {
      items.push({
        id: 'adicionais',
        label: 'Adicionais',
        imageUrl: '/src/assets/images/product_acai_copo_1795280701279.jpg',
        isAddonTab: true,
      });
    }

    return items;
  }, [activeCategories, visibleProducts, availableAddons.length, settings.logoUrl, settings.bannerUrl]);

  const handleSaveCartItem = (newItem: CartItem) => {
    setCart((prev) => {
      const exists = prev.some((i) => i.cartItemId === newItem.cartItemId);
      if (exists) {
        return prev.map((i) => (i.cartItemId === newItem.cartItemId ? newItem : i));
      }
      return [...prev, newItem];
    });
    setSelectedProduct(null);
    setEditingCartItem(null);
    setCartOpen(true);
  };

  const handleUpdateCartQty = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartItemId !== cartItemId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          const unitPrice = item.lineTotal / item.quantity;
          return {
            ...item,
            quantity: nextQty,
            lineTotal: Number((unitPrice * nextQty).toFixed(2)),
          };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  };

  const handleEditCartItem = (item: CartItem) => {
    const product = visibleProducts.find((p) => p.id === item.productId);
    if (!product) return;
    setEditingCartItem(item);
    setSelectedProduct(product);
    setCartOpen(false);
  };

  const handleOrderCreated = (ref: LocalTrackedOrderRef) => {
    const nextRefs = [ref, ...trackedRefs].slice(0, 10);
    setTrackedRefs(nextRefs);
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(nextRefs));
    setActiveTrackingId(ref.trackingId);
    setCart([]);
    setAppliedCoupon(null);
    setCheckoutOpen(false);
    setCartOpen(false);
    setViewMode('tracking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateSection = (sectionId: string) => {
    const needsHomeSwitch = viewMode !== 'store' || activePage !== 'home';
    if (viewMode !== 'store') setViewMode('store');
    if (activePage !== 'home') onNavigateHome();

    if (sectionId === 'topo') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (needsHomeSwitch) {
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 110);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenCatalogPage = (categoryId = 'all') => {
    if (viewMode !== 'store') setViewMode('store');
    onNavigateCatalog(categoryId);
  };

  const handleOpenTracking = () => {
    setViewMode('tracking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProductModal = (product: Product) => {
    setEditingCartItem(null);
    setSelectedProduct(product);
  };

  const totalCartItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const whatsappClean = (settings.whatsapp || '').replace(/\D/g, '');

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5EB] text-[#1A1216] pb-16 md:pb-0 overflow-x-clip">
      <StoreHeader
        settings={settings}
        cartCount={totalCartItems}
        onOpenCart={() => setCartOpen(true)}
        onNavigateSection={handleNavigateSection}
        onOpenCatalog={() => handleOpenCatalogPage('all')}
        onOpenTracking={handleOpenTracking}
        onOpenAdmin={onOpenAdmin}
      />

      {viewMode === 'tracking' ? (
        <main className="flex-1 bg-[#FFF5EB]">
          <OrderTrackingView
            settings={settings}
            trackedRefs={trackedRefs}
            activeTrackingId={activeTrackingId}
            onSelectTrackingId={setActiveTrackingId}
            onBackToStore={() => {
              setViewMode('store');
              onNavigateHome();
            }}
          />
        </main>
      ) : activePage === 'catalog' ? (
        <main className="flex-1">
          <FullCatalogView
            products={visibleProducts}
            categories={categories}
            addons={addons}
            favorites={favorites}
            ratingStatsByProduct={ratingStatsByProduct}
            initialCategoryId={catalogCategoryHint}
            onToggleFavorite={toggleFavorite}
            onSelectProduct={openProductModal}
            onBackToHome={onNavigateHome}
          />
        </main>
      ) : (
        <main className="flex-1">
          {/* App-Style Search, Favorites & Customer Account Filter Bar */}
          <div className="mx-auto max-w-7xl px-3.5 pt-3.5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="relative flex-1 min-w-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#781B68]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar tigela, copo, sorvete, combo..."
                  className="da-card-3d w-full rounded-2xl py-2.5 sm:py-3 pl-10 pr-3 text-sm text-[#1A1216] placeholder:text-[#6D5A63] focus:border-[#781B68] focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setOnlyFavorites((v) => !v)}
                aria-label="Filtrar produtos favoritos"
                className={`da-card-3d inline-flex min-h-[42px] sm:min-h-[44px] items-center gap-1.5 sm:gap-2 rounded-2xl px-3.5 sm:px-4 py-2 text-xs font-bold transition cursor-pointer shrink-0 ${
                  onlyFavorites
                    ? 'bg-[#4A123F] text-white border-[#4A123F]'
                    : 'bg-white text-[#4A123F] hover:border-[#781B68]/40'
                }`}
              >
                <Heart className={`h-4 w-4 ${onlyFavorites ? 'fill-[#E6AE52] text-[#E6AE52]' : ''}`} />
                <span className="hidden sm:inline">Favoritos</span>
                {favorites.length > 0 && (
                  <span className="font-mono-tabular text-[11px]">({favorites.length})</span>
                )}
              </button>

              {user ? (
                <button
                  type="button"
                  onClick={() => void logout()}
                  title={`Conectado como ${user.displayName || user.email}. Clique para sair`}
                  aria-label="Sair da conta do cliente"
                  className="da-card-3d inline-flex min-h-[42px] sm:min-h-[44px] items-center gap-1.5 rounded-2xl bg-white px-3 sm:px-3.5 py-2 text-xs font-bold text-[#4A123F] hover:border-[#781B68]/40 cursor-pointer shrink-0"
                >
                  <UserCheck className="h-4 w-4 text-emerald-700" />
                  <span className="hidden sm:inline max-w-[96px] truncate">
                    {(user.displayName || 'Conta').split(' ')[0]}
                  </span>
                  <LogOut className="h-3.5 w-3.5 text-[#5C4952]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  aria-label="Entrar com Google para avaliar produtos"
                  className="da-card-3d inline-flex min-h-[42px] sm:min-h-[44px] items-center gap-1.5 rounded-2xl bg-white px-3 sm:px-3.5 py-2 text-xs font-bold text-[#4A123F] hover:border-[#781B68]/40 cursor-pointer shrink-0"
                >
                  <LogIn className="h-4 w-4 text-[#781B68]" />
                  <span className="hidden sm:inline">Entrar</span>
                </button>
              )}
            </div>
          </div>

          {/* Instant Search / Favorites Results when active on Home */}
          {isHomeQuickFiltering ? (
            <section className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 lg:px-8 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#310D2B]">
                    {onlyFavorites && !searchTerm.trim()
                      ? 'Seus Favoritos'
                      : `Resultados (${homeFilteredProducts.length})`}
                  </h2>
                  <p className="text-xs text-[#5C4952]">
                    Toque em um produto para personalizar ou adicionar à sacola.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setOnlyFavorites(false);
                    }}
                    className="text-xs font-bold text-[#781B68] underline cursor-pointer"
                  >
                    Limpar filtro
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenCatalogPage(onlyFavorites ? 'favorites' : 'all')}
                    className="da-btn-3d rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer"
                  >
                    Abrir Catálogo Completo
                  </button>
                </div>
              </div>

              {homeFilteredProducts.length === 0 ? (
                <div className="da-card-3d rounded-3xl p-8 text-center text-sm text-[#5C4952]">
                  {onlyFavorites
                    ? 'Você ainda não favoritou nenhum produto.'
                    : 'Nenhum produto encontrado com essa busca.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                  {homeFilteredProducts.map((product) => {
                    const stat = ratingStatsByProduct[product.id];
                    return (
                      <ProductCard
                        key={product.id}
                        product={product}
                        variant="compact"
                        isFavorite={favorites.includes(product.id)}
                        ratingAvg={stat?.avg}
                        ratingCount={stat?.count}
                        onToggleFavorite={toggleFavorite}
                        onSelect={openProductModal}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* 3D Hero Showcase Banner */}
              <StoreHero
                settings={settings}
                featuredProducts={visibleProducts.filter((p) => p.featured)}
                onExploreMenu={() => handleNavigateSection('carrosseis')}
                onSelectProduct={openProductModal}
                onOpenTracking={handleOpenTracking}
              />

              {/* Circular Categories Carousel (Opens /cardapio filtered on tap) */}
              <section className="mx-auto max-w-7xl px-3.5 py-3 sm:px-6 lg:px-8">
                <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar pb-2 pt-1 lg:justify-center">
                  {categoryBubbles.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleOpenCatalogPage(cat.id)}
                      className="group flex flex-col items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-none"
                    >
                      <div className="relative flex h-15 w-15 sm:h-19 sm:w-19 items-center justify-center overflow-hidden rounded-full bg-white p-1 border border-[#781B68]/18 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:ring-2 group-hover:ring-[#781B68]/45">
                        {cat.isAddonTab ? (
                          <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#4A123F] to-[#781B68] text-[#E6AE52]">
                            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
                          </div>
                        ) : (
                          <img
                            src={cat.imageUrl}
                            alt={cat.label}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="h-full w-full rounded-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        )}
                      </div>
                      <span className="text-[11px] sm:text-xs font-bold text-[#4A3B42] group-hover:text-[#4A123F] whitespace-nowrap transition-colors">
                        {cat.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Up to 5 Independent Horizontal Carousel Rows (Max 6 items per row) */}
              <div
                id="carrosseis"
                className="mx-auto max-w-7xl px-3.5 py-4 sm:px-6 lg:px-8 space-y-7 sm:space-y-9"
              >
                {loading ? (
                  <div className="space-y-6">
                    {[1, 2, 3].map((row) => (
                      <div key={row} className="space-y-3">
                        <div className="h-6 w-40 animate-pulse rounded-lg bg-[#781B68]/10" />
                        <div className="flex gap-3 overflow-hidden">
                          {[1, 2, 3, 4].map((card) => (
                            <div
                              key={card}
                              className="h-56 w-[154px] sm:w-[196px] shrink-0 animate-pulse rounded-2xl border border-[#781B68]/10 bg-white/75"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : carouselRows.length === 0 ? (
                  <div className="da-card-3d rounded-3xl p-8 text-center text-sm text-[#5C4952]">
                    Nenhum produto disponível no momento.
                  </div>
                ) : (
                  carouselRows.map((row, index) => (
                    <ProductCarouselRow
                      key={row.id}
                      title={row.title}
                      subtitle={row.subtitle}
                      products={row.products}
                      favorites={favorites}
                      ratingStatsByProduct={ratingStatsByProduct}
                      onToggleFavorite={toggleFavorite}
                      onSelectProduct={openProductModal}
                      onViewAll={() => handleOpenCatalogPage(row.filterId)}
                      delayMs={index * 55}
                    />
                  ))
                )}

                {/* Centered Prominent CTA Below the 5 Rows */}
                <ScrollReveal>
                  <div className="flex flex-col items-center justify-center pt-2 pb-2">
                    <button
                      type="button"
                      onClick={() => handleOpenCatalogPage('all')}
                      className="da-btn-3d inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-2xl border border-[#E6AE52]/40 px-7 sm:px-9 py-3 text-xs sm:text-sm font-extrabold tracking-wide uppercase text-white cursor-pointer"
                    >
                      <LayoutGrid className="h-4 w-4 text-[#E6AE52]" />
                      <span>VER TODOS OS PRODUTOS</span>
                      <ArrowRight className="h-4 w-4 text-[#E6AE52]" />
                    </button>
                  </div>
                </ScrollReveal>
              </div>

              {/* Exclusive Offer Horizontal 3D Banner */}
              {promoShowcaseProduct && (
                <section className="mx-auto max-w-7xl px-3.5 py-4 sm:px-6 lg:px-8">
                  <ScrollReveal>
                    <div
                      className="da-card-3d relative overflow-hidden rounded-[26px] p-5 sm:p-8"
                      style={{
                        background:
                          'linear-gradient(125deg, #F6E6F2 0%, #FFF8F1 55%, #FBEBD3 100%)',
                      }}
                    >
                      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-12">
                        <div className="md:col-span-7 space-y-2.5 sm:space-y-3">
                          <span className="inline-block text-[11px] sm:text-xs font-extrabold tracking-wide text-[#781B68] uppercase">
                            Oferta Exclusiva · Cupom DOISAMORES10
                          </span>
                          <h2 className="font-display text-xl sm:text-3xl font-bold text-[#310D2B] text-balance">
                            Até 10% OFF com o cupom na sua sacola + preços promocionais
                          </h2>
                          <p className="text-xs sm:text-sm text-[#4A3B42] max-w-lg">
                            Válido em tigelas, copos e combos selecionados acima de R$ 30,00. Monte com seus adicionais favoritos!
                          </p>
                          <div className="pt-1 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleOpenCatalogPage('promocoes')}
                              className="da-btn-3d inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-bold cursor-pointer"
                            >
                              <span>Ver Promoções</span>
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="md:col-span-5 flex items-center justify-end gap-4">
                          <div className="da-float-slow relative w-40 sm:w-52 aspect-[4/3] overflow-hidden rounded-2xl border border-[#781B68]/25 shadow-lg">
                            <img
                              src={promoShowcaseProduct.imageUrl}
                              alt={promoShowcaseProduct.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#4A123F] to-[#781B68] text-white shadow-[0_12px_28px_-6px_rgba(74,18,63,0.55)] ring-4 ring-[#E6AE52]/35">
                            <span className="font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#E6AE52] leading-none">
                              10%
                            </span>
                            <span className="text-[11px] font-bold tracking-wider uppercase mt-0.5">
                              OFF
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>
                </section>
              )}

              {/* Approved Customer Reviews */}
              <section id="avaliacoes" className="mx-auto max-w-7xl px-3.5 py-8 sm:px-6 lg:px-8">
                <ScrollReveal>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#310D2B]">
                        Avaliações Verificadas
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-[#4A3B42]">
                        Comentários reais publicados por quem já pediu na {settings.storeName}.
                      </p>
                    </div>
                    {approvedReviews.length > 0 && (
                      <div className="inline-flex items-center gap-2 text-sm font-bold text-[#4A123F]">
                        <Star className="h-4 w-4 fill-[#E6AE52] text-[#E6AE52]" />
                        <span className="font-mono-tabular">
                          {(
                            approvedReviews.reduce((a, r) => a + r.rating, 0) / approvedReviews.length
                          ).toFixed(1)}{' '}
                          / 5,0 · {approvedReviews.length} avaliações
                        </span>
                      </div>
                    )}
                  </div>
                </ScrollReveal>

                {approvedReviews.length === 0 ? (
                  <div className="mt-5 da-card-3d rounded-3xl p-7 text-center text-sm text-[#5C4952]">
                    Assim que os clientes avaliarem seus pedidos e a loja aprovar os comentários, eles aparecerão aqui.
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                    {approvedReviews.slice(0, 6).map((rev, idx) => (
                      <ScrollReveal key={rev.id} delayMs={idx * 65}>
                        <article className="da-card-3d flex h-full flex-col justify-between rounded-3xl p-5 space-y-3">
                          <div>
                            <div className="flex items-center justify-between text-xs text-[#5C4952]">
                              <span className="font-bold text-[#781B68] truncate">
                                {rev.productName}
                              </span>
                              <span className="shrink-0">{formatDateBR(rev.createdAt)}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`h-4 w-4 ${
                                    s <= rev.rating
                                      ? 'fill-[#E6AE52] text-[#E6AE52]'
                                      : 'text-neutral-300'
                                  }`}
                                />
                              ))}
                            </div>
                            <p className="mt-2.5 text-sm text-[#1A1216] leading-relaxed">
                              “{rev.comment}”
                            </p>
                            {rev.adminReply && (
                              <div className="mt-3 rounded-2xl bg-[#FFF5EB] p-3 text-xs text-[#43353C] border border-[#781B68]/10">
                                <span className="font-bold text-[#4A123F]">Dois Amores: </span>
                                {rev.adminReply}
                              </div>
                            )}
                          </div>
                          <div className="border-t border-[#781B68]/10 pt-2.5 text-xs font-semibold text-[#3D2E35]">
                            {rev.customerName} · Compra verificada
                          </div>
                        </article>
                      </ScrollReveal>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="border-t border-[#781B68]/20 bg-[#310D2B] text-white no-print">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src={settings.logoUrl || '/assets/aistudio/image_332d0e8c.png'}
                  alt={settings.storeName}
                  className="h-11 w-11 rounded-full bg-white object-contain p-0.5 ring-2 ring-[#E6AE52]/50"
                />
                <div>
                  <div className="font-display text-lg font-bold">{settings.storeName}</div>
                  <div className="text-xs text-[#E6AE52]">Açaíteria e Sorveteria</div>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-white/80 max-w-sm">
                {settings.description}
              </p>
            </div>

            <div className="space-y-2 text-xs text-white/85">
              <div className="text-sm font-bold text-white">Funcionamento & Contato</div>
              <div>
                {settings.openingDays} · {settings.openingHours}
              </div>
              <div>{settings.address}</div>
              <div>Telefone: {settings.phone}</div>
              {settings.cnpj && <div>CNPJ: {settings.cnpj}</div>}
            </div>

            <div className="space-y-3 text-xs">
              <div className="text-sm font-bold text-white">Atendimento & Acesso</div>
              <div className="flex flex-wrap gap-2.5">
                {whatsappClean && (
                  <a
                    href={`https://wa.me/${whatsappClean}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 transition"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Atendimento WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/25 bg-white/8 px-4 py-2 font-semibold text-white hover:bg-white/15 transition cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5 text-[#E6AE52]" />
                  Painel Administrativo
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/12 pt-5 text-xs text-white/65 flex flex-wrap justify-between gap-2">
            <span>
              © {new Date().getFullYear()} {settings.storeName}. Todos os direitos reservados.
            </span>
            <span>Pedidos online com acompanhamento em tempo real.</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom App Navigation Bar (md:hidden, keeps <= 15% sticky viewport cap) */}
      <nav
        aria-label="Navegação rápida mobile"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#781B68]/15 bg-white/95 backdrop-blur-md md:hidden no-print"
      >
        <div className="grid h-16 grid-cols-5 items-center px-1">
          <button
            type="button"
            onClick={() => handleNavigateSection('topo')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition cursor-pointer ${
              viewMode === 'store' && activePage === 'home'
                ? 'text-[#4A123F]'
                : 'text-[#6B5A62]'
            }`}
          >
            <Home className="h-5 w-5" />
            <span>Início</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCatalogPage('all')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition cursor-pointer ${
              viewMode === 'store' && activePage === 'catalog' && catalogCategoryHint !== 'promocoes'
                ? 'text-[#4A123F]'
                : 'text-[#6B5A62]'
            }`}
          >
            <LayoutGrid className="h-5 w-5" />
            <span>Cardápio</span>
          </button>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (totalCartItems > 0) setCartOpen(true);
                else handleOpenCatalogPage('all');
              }}
              aria-label="Pedir agora ou abrir sacola"
              className="da-btn-3d relative -mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-full border-4 border-[#FFF5EB] text-white cursor-pointer"
            >
              <ShoppingBag className="h-5 w-5" />
              {totalCartItems > 0 && (
                <span className="font-mono-tabular absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#E6AE52] px-1 text-[10px] font-extrabold text-[#310D2B] shadow-sm">
                  {totalCartItems}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleOpenCatalogPage('promocoes')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition cursor-pointer ${
              viewMode === 'store' && activePage === 'catalog' && catalogCategoryHint === 'promocoes'
                ? 'text-[#4A123F]'
                : 'text-[#6B5A62]'
            }`}
          >
            <Tag className="h-5 w-5" />
            <span>Ofertas</span>
          </button>

          <button
            type="button"
            onClick={handleOpenTracking}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition cursor-pointer ${
              viewMode === 'tracking' ? 'text-[#4A123F]' : 'text-[#6B5A62]'
            }`}
          >
            <ClipboardList className="h-5 w-5" />
            <span>Pedidos</span>
          </button>
        </div>
      </nav>

      {selectedProduct && (
        <ProductCustomizerModal
          product={selectedProduct}
          addons={addons}
          reviews={approvedReviews}
          editingItem={editingCartItem}
          onClose={() => {
            setSelectedProduct(null);
            setEditingCartItem(null);
          }}
          onSaveItem={handleSaveCartItem}
        />
      )}

      <CartDrawer
        isOpen={cartOpen}
        items={cart}
        settings={settings}
        appliedCoupon={appliedCoupon}
        onApplyCoupon={setAppliedCoupon}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onEditItem={handleEditCartItem}
        onProceedToCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      {checkoutOpen && (
        <CheckoutModal
          items={cart}
          settings={settings}
          appliedCoupon={appliedCoupon}
          onClose={() => setCheckoutOpen(false)}
          onOrderCreated={handleOrderCreated}
        />
      )}

      <CustomerChatWidget settings={settings} latestOrder={trackedRefs[0] || null} />
    </div>
  );
};

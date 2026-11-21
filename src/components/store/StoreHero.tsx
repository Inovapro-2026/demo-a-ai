import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock, MapPin, MessageCircle, ShoppingBag } from 'lucide-react';
import type { Product, StoreSettings } from '../../types/domain.ts';
import { formatBRL } from '../../lib/formatters.ts';
import { PWAInstallButton } from '../PWAInstallButton.tsx';

interface StoreHeroProps {
  settings: StoreSettings;
  featuredProducts: Product[];
  onExploreMenu: () => void;
  onSelectProduct: (product: Product) => void;
  onOpenTracking: () => void;
}

export const StoreHero: React.FC<StoreHeroProps> = ({
  settings,
  featuredProducts,
  onExploreMenu,
  onSelectProduct,
  onOpenTracking,
}) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  const slides = useMemo(() => {
    const heroSlide = {
      id: 'hero-main',
      title: settings.storeName,
      subtitle: 'Batido na hora com textura cremosa',
      imageUrl: settings.bannerUrl || '/src/assets/images/hero_acai_banner_1795280701199.jpg',
      product: null as Product | null,
    };
    const productSlides = featuredProducts
      .filter((p) => p.available && !p.archived && p.imageUrl)
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: formatBRL(
          typeof p.promoPrice === 'number' && p.promoPrice > 0 && p.promoPrice < p.price
            ? p.promoPrice
            : p.price
        ),
        imageUrl: p.imageUrl,
        product: p,
      }));
    return [heroSlide, ...productSlides];
  }, [settings.storeName, settings.bannerUrl, featuredProducts]);

  // Subtle passive scroll parallax (compositor-only translate3d, skipped on reduced-motion)
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        setScrollY(Math.min(180, window.scrollY));
        rafId = 0;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Gentle auto-rotation for hero showcase slides
  useEffect(() => {
    if (slides.length <= 1) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const currentSlide = slides[activeSlide] || slides[0];
  const isStoreAccepting = settings.isOpen && !settings.pauseOrders;
  const whatsappClean = (settings.whatsapp || '').replace(/\D/g, '');
  const whatsappUrl = whatsappClean
    ? `https://wa.me/${whatsappClean}?text=${encodeURIComponent(
        `Olá! Gostaria de fazer um pedido na ${settings.storeName}.`
      )}`
    : '#';

  const parallaxY = Math.round(scrollY * 0.14);

  return (
    <section id="topo" className="relative overflow-hidden bg-[#FFF5EB] pb-6 pt-4 sm:pt-6 lg:pt-8">
      {!isStoreAccepting && (
        <div className="mx-auto mb-4 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-[#310D2B] px-4 py-2.5 text-center text-xs sm:text-sm font-medium text-[#FFF5EB] shadow-sm">
            {settings.closedMessage ||
              'No momento não estamos recebendo novos pedidos. Você pode consultar o cardápio normalmente.'}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main 3D Deep-Purple Hero Showcase Banner */}
        <div
          className="relative overflow-hidden rounded-[28px] border border-[#781B68]/40 text-white shadow-[0_24px_56px_-18px_rgba(49,13,43,0.55),0_0_32px_-8px_rgba(120,27,104,0.35)]"
          style={{
            background:
              'linear-gradient(135deg, var(--brand-deep, #310D2B) 0%, var(--brand-primary, #4A123F) 52%, var(--brand-secondary, #781B68) 100%)',
          }}
        >
          {/* Ambient radial light depth layers */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-55"
            style={{
              background: 'radial-gradient(circle, rgba(230, 174, 82, 0.28) 0%, transparent 70%)',
              transform: `translate3d(0, ${Math.round(parallaxY * 0.5)}px, 0)`,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full opacity-45"
            style={{
              background: 'radial-gradient(circle, rgba(120, 27, 104, 0.5) 0%, transparent 70%)',
            }}
          />

          <div className="relative z-10 grid grid-cols-1 gap-6 p-6 sm:p-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:p-11">
            {/* Left Copy & CTA */}
            <div className="lg:col-span-6 space-y-5">
              <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-[#FBE6C2]">
                <span>{isStoreAccepting ? 'Aberto agora para pedidos' : 'Loja fechada no momento'}</span>
                <span aria-hidden="true">·</span>
                <span>{settings.openingDays}</span>
                <span aria-hidden="true">·</span>
                <span>{settings.openingHours}</span>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-[46px] font-bold tracking-tight text-white text-balance leading-[1.08]">
                {settings.promoBannerTitle || 'Sabor artesanal que conquista em cada colherada'}
              </h1>

              <p className="max-w-xl text-sm sm:text-base leading-relaxed text-[#FFF5EB]/90">
                {settings.promoBannerSubtitle || settings.description}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onExploreMenu}
                  className="da-btn-gold inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>Pedir Agora</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={onOpenTracking}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/18 active:scale-[0.985] transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Acompanhar pedido
                </button>

                {whatsappClean && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-sm font-semibold text-[#FFF5EB] hover:bg-white/16 transition whitespace-nowrap shrink-0"
                  >
                    <MessageCircle className="h-4 w-4 text-[#E6AE52]" />
                    WhatsApp
                  </a>
                )}

                <PWAInstallButton />
              </div>
            </div>

            {/* Right 3D Appetizing Showcase Media */}
            <div className="lg:col-span-6">
              <div
                onClick={() => {
                  if (currentSlide?.product) onSelectProduct(currentSlide.product);
                }}
                className={`group relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/20 bg-[#240717] shadow-[0_24px_48px_-12px_rgba(12,3,10,0.65),0_0_24px_-4px_rgba(230,174,82,0.22)] transition-transform duration-300 ${
                  currentSlide?.product ? 'cursor-pointer hover:-translate-y-1' : ''
                }`}
                style={{
                  transform: `translate3d(0, ${-Math.round(parallaxY * 0.25)}px, 0)`,
                }}
              >
                {!imgError && currentSlide?.imageUrl ? (
                  <img
                    key={currentSlide.id}
                    src={currentSlide.imageUrl}
                    alt={currentSlide.title}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#4A123F] to-[#310D2B] p-8 text-center">
                    <img
                      src={settings.logoUrl || '/assets/aistudio/image_332d0e8c.png'}
                      alt={settings.storeName}
                      className="h-24 w-24 rounded-full bg-white p-1 object-contain shadow-lg"
                    />
                    <p className="mt-4 font-display text-2xl font-bold text-white">
                      {settings.storeName}
                    </p>
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1A0616]/85 via-[#1A0616]/15 to-transparent" />

                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E6AE52]">
                      {currentSlide?.product ? 'Destaque da Casa · Toque para personalizar' : settings.storeName}
                    </div>
                    <div className="truncate font-display text-lg sm:text-xl font-bold text-white">
                      {currentSlide?.title}
                    </div>
                  </div>
                  <span className="font-mono-tabular shrink-0 rounded-xl bg-white/14 px-3 py-1.5 text-xs font-bold text-[#FFF5EB] backdrop-blur-xs">
                    {currentSlide?.product
                      ? currentSlide.subtitle
                      : `Entrega ${formatBRL(settings.deliveryFeeFixed)}`}
                  </span>
                </div>
              </div>

              {/* Clean slide pagination dots matching reference */}
              {slides.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  {slides.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setImgError(false);
                        setActiveSlide(idx);
                      }}
                      aria-label={`Ver destaque ${idx + 1}: ${s.title}`}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        idx === activeSlide
                          ? 'w-6 bg-[#E6AE52]'
                          : 'w-2 bg-white/35 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clean 3-column Store Info Strip below Hero */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="da-card-3d flex items-center gap-3 rounded-2xl px-4 py-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A123F]/10 text-[#4A123F] shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#310D2B]">Entrega estimada</div>
              <div className="text-xs text-[#4A3B42] tabular-nums truncate">
                {settings.estimatedDeliveryMinutes} min · Pedido mín. {formatBRL(settings.minOrderValue)}
              </div>
            </div>
          </div>

          <div className="da-card-3d flex items-center gap-3 rounded-2xl px-4 py-3.5 sm:col-span-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#781B68]/10 text-[#781B68] shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#310D2B]">Endereço & Retirada</div>
              <div className="text-xs text-[#4A3B42] truncate">
                {settings.address} {settings.pickupEnabled ? '· Retirada no balcão disponível' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

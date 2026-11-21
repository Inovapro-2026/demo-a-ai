import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Edit3, Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import type { CartItem, Coupon, StoreSettings } from '../../types/domain.ts';
import { DEFAULT_COUPONS } from '../../lib/defaultCatalog.ts';
import { db } from '../../lib/firebase.ts';
import { formatBRL } from '../../lib/formatters.ts';

interface CartDrawerProps {
  isOpen: boolean;
  items: CartItem[];
  settings: StoreSettings;
  appliedCoupon: Coupon | null;
  onApplyCoupon: (coupon: Coupon | null) => void;
  onClose: () => void;
  onUpdateQty: (cartItemId: string, delta: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onEditItem: (item: CartItem) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  items,
  settings,
  appliedCoupon,
  onApplyCoupon,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onEditItem,
  onProceedToCheckout,
}) => {
  const [couponInput, setCouponInput] = useState('');
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const subtotal = items.reduce((acc, item) => acc + item.lineTotal, 0);

  let discount = 0;
  if (appliedCoupon && subtotal >= appliedCoupon.minOrderValue) {
    discount =
      appliedCoupon.type === 'percent'
        ? (subtotal * appliedCoupon.value) / 100
        : Math.min(subtotal, appliedCoupon.value);
  }

  const belowMinimum = subtotal > 0 && subtotal < settings.minOrderValue;
  const storeBlocked = !settings.isOpen || settings.pauseOrders;

  const handleCheckCoupon = async () => {
    const code = couponInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) return;
    setCheckingCoupon(true);
    setCouponMessage(null);
    try {
      const snap = await getDoc(doc(db, 'coupons', code));
      const coupon: Coupon | null = snap.exists()
        ? { ...(snap.data() as Coupon), id: snap.id }
        : DEFAULT_COUPONS.find((c) => c.code === code) || null;

      if (!coupon || !coupon.active) {
        setCouponMessage('Cupom inválido ou inativo.');
        onApplyCoupon(null);
        return;
      }
      if (coupon.usedCount >= coupon.maxUses) {
        setCouponMessage('Limite de uso deste cupom esgotado.');
        onApplyCoupon(null);
        return;
      }
      if (coupon.expiresAt && new Date(coupon.expiresAt + 'T23:59:59').getTime() < Date.now()) {
        setCouponMessage('Cupom expirado.');
        onApplyCoupon(null);
        return;
      }
      if (subtotal < coupon.minOrderValue) {
        setCouponMessage(`Válido para pedidos a partir de ${formatBRL(coupon.minOrderValue)}.`);
        onApplyCoupon(null);
        return;
      }
      onApplyCoupon(coupon);
      setCouponMessage(`Cupom ${coupon.code} aplicado!`);
    } catch {
      setCouponMessage('Não foi possível validar o cupom agora.');
    } finally {
      setCheckingCoupon(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="cart-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex justify-end bg-[#1E081B]/60 backdrop-blur-[2px]"
        >
          <motion.div
            key="cart-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col bg-[#FFF5EB] shadow-2xl border-l border-[#781B68]/20"
          >
            <div className="flex items-center justify-between border-b border-[#781B68]/12 bg-white px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4A123F]/10 text-[#4A123F]">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#310D2B]">Sua Sacola</h2>
                  <p className="text-[11px] text-[#5C4952]">
                    {items.reduce((acc, i) => acc + i.quantity, 0)} itens selecionados
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[#4A3B42] hover:bg-[#FFF5EB] cursor-pointer"
                aria-label="Fechar sacola"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
              {items.length === 0 ? (
                <div className="da-card-3d flex flex-col items-center justify-center rounded-3xl py-16 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#4A123F]/8 text-[#781B68]">
                    <ShoppingBag className="h-8 w-8" />
                  </div>
                  <p className="mt-4 font-display text-lg font-bold text-[#310D2B]">
                    Sua sacola está vazia
                  </p>
                  <p className="mt-1 text-sm text-[#5C4952]">
                    Escolha um açaí ou sorvete no cardápio para começar.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.cartItemId} className="da-card-3d rounded-3xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          referrerPolicy="no-referrer"
                          className="h-16 w-16 rounded-2xl object-cover border border-[#781B68]/15 shrink-0"
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-[#1A1216] truncate">
                            {item.productName}
                          </h3>
                          <p className="text-xs text-[#5C4952]">
                            {[item.size?.name, item.base?.name].filter(Boolean).join(' · ')}
                          </p>
                          {item.addons.length > 0 && (
                            <p className="mt-1 text-xs text-[#43353C]">
                              + {item.addons.map((a) => `${a.qty}x ${a.name}`).join(', ')}
                            </p>
                          )}
                          {item.notes && (
                            <p className="mt-1 text-xs italic text-[#5C4952]">Obs.: {item.notes}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono-tabular text-sm font-extrabold text-[#4A123F] shrink-0">
                        {formatBRL(item.lineTotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#781B68]/10 pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditItem(item)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-[#4A123F] hover:bg-[#4A123F]/8 cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.cartItemId)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.cartItemId, -1)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#781B68]/20 bg-[#FFF5EB] text-[#310D2B] hover:bg-[#4A123F]/10 active:scale-95 cursor-pointer"
                          aria-label="Diminuir"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="font-mono-tabular w-5 text-center text-sm font-bold text-[#310D2B]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.cartItemId, 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#781B68]/20 bg-[#FFF5EB] text-[#310D2B] hover:bg-[#4A123F]/10 active:scale-95 cursor-pointer"
                          aria-label="Aumentar"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {items.length > 0 && (
                <div className="da-card-3d rounded-3xl p-4 space-y-2.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-[#310D2B]">
                    <Tag className="h-3.5 w-3.5 text-[#781B68]" />
                    Cupom de desconto
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Ex.: DOISAMORES10"
                      className="flex-1 rounded-xl border border-[#781B68]/25 bg-[#FFF5EB]/60 px-3 py-2 text-sm uppercase text-[#1A1216] focus:border-[#781B68] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={checkingCoupon}
                      onClick={() => void handleCheckCoupon()}
                      className="da-btn-3d rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {checkingCoupon ? 'Validando...' : 'Aplicar'}
                    </button>
                  </div>
                  {couponMessage && (
                    <p
                      className={`text-xs font-semibold ${
                        appliedCoupon ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {couponMessage}
                    </p>
                  )}
                  {appliedCoupon && (
                    <div className="flex items-center justify-between text-xs text-emerald-800">
                      <span>Cupom ativo: {appliedCoupon.code}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onApplyCoupon(null);
                          setCouponMessage(null);
                        }}
                        className="underline cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-[#781B68]/15 bg-white p-5 space-y-3 shadow-[0_-8px_24px_-12px_rgba(49,13,43,0.18)]">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-[#43353C]">
                    <span>Subtotal</span>
                    <span className="font-mono-tabular font-semibold">{formatBRL(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Desconto</span>
                      <span className="font-mono-tabular font-semibold">-{formatBRL(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-[#5C4952]">
                    <span>Taxa de entrega</span>
                    <span>Calculada no checkout (ou grátis na retirada)</span>
                  </div>
                  <div className="flex justify-between border-t border-[#781B68]/12 pt-2.5 text-base font-extrabold text-[#310D2B]">
                    <span>Total parcial</span>
                    <span className="font-mono-tabular text-[#4A123F]">
                      {formatBRL(Math.max(0, subtotal - discount))}
                    </span>
                  </div>
                </div>

                {belowMinimum && (
                  <p className="text-xs font-semibold text-amber-800">
                    Pedido mínimo de {formatBRL(settings.minOrderValue)} para finalizar.
                  </p>
                )}
                {storeBlocked && (
                  <p className="text-xs font-semibold text-red-700">
                    {settings.closedMessage || 'Loja fechada ou pausada para pedidos no momento.'}
                  </p>
                )}

                <button
                  type="button"
                  disabled={belowMinimum || storeBlocked}
                  onClick={onProceedToCheckout}
                  className="da-btn-gold flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold disabled:opacity-50 cursor-pointer"
                >
                  <span>Ir para o Checkout</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

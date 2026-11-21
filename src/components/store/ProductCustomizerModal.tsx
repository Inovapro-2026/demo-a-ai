import React, { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Check, Lock, Minus, Plus, Send, Star, X } from 'lucide-react';
import type {
  Addon,
  AddonGroup,
  CartItem,
  Product,
  ProductOption,
  Review,
  SelectedAddon,
} from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { useStoreData } from '../../hooks/useStoreData.tsx';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL, formatDateBR } from '../../lib/formatters.ts';

interface ProductCustomizerModalProps {
  product: Product;
  addons: Addon[];
  reviews: Review[];
  editingItem?: CartItem | null;
  onClose: () => void;
  onSaveItem: (item: CartItem) => void;
}

const GROUP_LABELS: Record<AddonGroup, string> = {
  cremes: 'Cremes Especiais',
  frutas: 'Frutas Frescas',
  caldas: 'Caldas',
  crocantes: 'Crocantes e Granola',
  especiais: 'Complementos Especiais',
};

export const ProductCustomizerModal: React.FC<ProductCustomizerModalProps> = ({
  product,
  addons,
  reviews,
  editingItem,
  onClose,
  onSaveItem,
}) => {
  const { user, signInWithGoogle } = useAuth();
  const { customerOrders, customerReviews, ratingStatsByProduct } = useStoreData();

  const [selectedSize, setSelectedSize] = useState<ProductOption | null>(
    editingItem?.size || product.sizes[0] || null
  );
  const [selectedBase, setSelectedBase] = useState<ProductOption | null>(
    editingItem?.base || product.bases[0] || null
  );
  const [addonQtyMap, setAddonQtyMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (editingItem?.addons) {
      editingItem.addons.forEach((a) => {
        map[a.addonId] = a.qty;
      });
    }
    return map;
  });
  const [quantity, setQuantity] = useState<number>(editingItem?.quantity || 1);
  const [notes, setNotes] = useState<string>(editingItem?.notes || '');

  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewName, setReviewName] = useState<string>(user?.displayName || '');
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    if (user?.displayName && !reviewName) {
      setReviewName(user.displayName);
    }
  }, [user?.displayName, reviewName]);

  const availableAddons = useMemo(() => addons.filter((a) => a.available), [addons]);

  const groupedAddons = useMemo(() => {
    const groups: Partial<Record<AddonGroup, Addon[]>> = {};
    for (const addon of availableAddons) {
      if (!groups[addon.group]) groups[addon.group] = [];
      groups[addon.group]!.push(addon);
    }
    return groups;
  }, [availableAddons]);

  const baseUnitPrice =
    typeof product.promoPrice === 'number' &&
    product.promoPrice > 0 &&
    product.promoPrice < product.price
      ? product.promoPrice
      : product.price;

  const selectedAddonsList: SelectedAddon[] = useMemo(() => {
    const list: SelectedAddon[] = [];
    for (const addon of availableAddons) {
      const q = addonQtyMap[addon.id] || 0;
      if (q > 0) {
        list.push({ addonId: addon.id, name: addon.name, price: addon.price, qty: q });
      }
    }
    return list;
  }, [availableAddons, addonQtyMap]);

  const addonsTotal = selectedAddonsList.reduce((acc, a) => acc + a.price * a.qty, 0);
  const unitTotal =
    baseUnitPrice +
    (selectedSize?.priceDelta || 0) +
    (selectedBase?.priceDelta || 0) +
    addonsTotal;
  const lineTotal = unitTotal * quantity;

  const productReviews = useMemo(
    () => reviews.filter((r) => r.productId === product.id && r.status === 'approved'),
    [reviews, product.id]
  );

  const ratingStat = ratingStatsByProduct[product.id] || {
    avg:
      productReviews.length > 0
        ? Number(
            (
              productReviews.reduce((acc, r) => acc + r.rating, 0) / productReviews.length
            ).toFixed(1)
          )
        : Number((product.ratingAvg || 0).toFixed(1)),
    count: productReviews.length > 0 ? productReviews.length : product.ratingCount || 0,
  };

  // Find user's own reviews for this product
  const myProductReviews = useMemo(
    () => customerReviews.filter((r) => r.productId === product.id),
    [customerReviews, product.id]
  );

  // Find an eligible purchased order (non-cancelled, containing product.id, not yet reviewed)
  const eligibleOrder = useMemo(() => {
    if (!user?.emailVerified) return null;
    const reviewedOrderIds = new Set(myProductReviews.map((r) => r.orderId));
    return (
      customerOrders.find(
        (ord) =>
          ord.status !== 'cancelled' &&
          Array.isArray(ord.items) &&
          ord.items.some((item) => item.productId === product.id) &&
          !reviewedOrderIds.has(ord.id)
      ) || null
    );
  }, [user?.emailVerified, customerOrders, myProductReviews, product.id]);

  const handlePublishCatalogReview = async () => {
    if (!user?.emailVerified || !eligibleOrder) return;
    const cleanName = (reviewName || eligibleOrder.customerName || user.displayName || '').trim();
    const cleanComment = reviewComment.trim();

    if (cleanName.length < 2) {
      setReviewError('Informe seu nome (mínimo 2 letras).');
      return;
    }
    if (cleanComment.length < 3) {
      setReviewError('Escreva um comentário com pelo menos 3 caracteres.');
      return;
    }

    setReviewSubmitting(true);
    setReviewError(null);
    const reviewId = `${eligibleOrder.id}_${product.id}`;

    try {
      await setDoc(doc(db, 'reviews', reviewId), {
        productId: product.id,
        productName: product.name,
        orderId: eligibleOrder.id,
        trackingId: eligibleOrder.trackingId,
        customerUid: user.uid,
        customerName: cleanName.slice(0, 100),
        rating: Math.min(5, Math.max(1, Math.round(reviewRating))),
        comment: cleanComment.slice(0, 800),
        status: 'pending',
        adminReply: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setReviewComment('');
      setReviewSuccess(true);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, `reviews/${reviewId}`);
      } catch {
        setReviewError(
          'Não foi possível salvar sua avaliação agora. Verifique sua conexão e tente novamente.'
        );
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  const updateAddonQty = (addon: Addon, delta: number) => {
    setAddonQtyMap((prev) => {
      const current = prev[addon.id] || 0;
      const next = Math.max(0, Math.min(addon.maxQty || 2, current + delta));
      return { ...prev, [addon.id]: next };
    });
  };

  const handleConfirm = () => {
    const item: CartItem = {
      cartItemId:
        editingItem?.cartItemId ||
        `ci_${product.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      unitBasePrice: baseUnitPrice,
      size: selectedSize,
      base: selectedBase,
      addons: selectedAddonsList,
      quantity,
      notes: notes.trim(),
      lineTotal,
    };
    onSaveItem(item);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1E081B]/65 backdrop-blur-[2px] p-0 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_28px_60px_-14px_rgba(49,13,43,0.45)] border border-[#781B68]/25"
      >
        <div className="flex items-center justify-between border-b border-[#781B68]/12 bg-[#FFF5EB]/60 px-5 py-4">
          <div>
            <p className="text-xs font-bold text-[#781B68]">{product.categoryName}</p>
            <h2 className="font-display text-xl font-bold text-[#310D2B]">{product.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[#4A3B42] hover:bg-white cursor-pointer"
            aria-label="Fechar janela"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left column: Photo + Star Rating Summary + Reviews + Registered User Review Box */}
            <div className="lg:col-span-5 space-y-5">
              <div className="da-card-3d aspect-[4/3] w-full overflow-hidden rounded-3xl bg-[#FFF5EB]">
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>

              <p className="text-sm leading-relaxed text-[#43353C]">{product.description}</p>

              {/* Average Star Rating & Approved Reviews */}
              <div className="border-t border-[#781B68]/12 pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#310D2B]">Avaliações de Clientes</h3>
                  {ratingStat.count > 0 ? (
                    <span className="inline-flex items-center gap-1 font-mono-tabular text-xs font-bold text-[#4A123F]">
                      <Star className="h-3.5 w-3.5 fill-[#E6AE52] text-[#E6AE52]" />
                      {ratingStat.avg.toFixed(1)} / 5,0 · ({ratingStat.count})
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-[#5C4952]">Sem avaliações</span>
                  )}
                </div>

                {/* Star Bar Summary */}
                <div className="flex items-center justify-between rounded-2xl border border-[#781B68]/12 bg-[#FFF5EB]/65 px-3.5 py-2.5">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-4 w-4 ${
                          ratingStat.count > 0 && s <= Math.round(ratingStat.avg)
                            ? 'fill-[#E6AE52] text-[#E6AE52]'
                            : 'text-neutral-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-mono-tabular text-xs font-bold text-[#310D2B]">
                    {ratingStat.count > 0
                      ? `${ratingStat.avg.toFixed(1)} de 5 estrelas`
                      : 'Seja o primeiro a avaliar'}
                  </span>
                </div>

                {/* Registered User Post-Purchase Review Box */}
                <div className="rounded-2xl border border-[#781B68]/18 bg-[#FFF5EB]/35 p-3.5 space-y-2.5">
                  {!user || !user.emailVerified ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#310D2B]">
                        Já comprou este produto? Entre com sua conta para avaliar!
                      </p>
                      <button
                        type="button"
                        onClick={() => void signInWithGoogle()}
                        className="da-btn-3d inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold cursor-pointer"
                      >
                        <Lock className="h-3.5 w-3.5 text-[#E6AE52]" />
                        Entrar com Google
                      </button>
                    </div>
                  ) : eligibleOrder ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#310D2B]">
                          Avaliar sua compra
                        </span>
                        <span className="font-mono-tabular text-[11px] font-semibold text-[#781B68]">
                          Pedido {eligibleOrder.orderNumber}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewRating(star)}
                            aria-label={`Nota ${star} estrelas`}
                            className="p-0.5 cursor-pointer"
                          >
                            <Star
                              className={`h-5 w-5 transition ${
                                star <= reviewRating
                                  ? 'fill-[#E6AE52] text-[#E6AE52]'
                                  : 'text-neutral-300 hover:text-[#E6AE52]'
                              }`}
                            />
                          </button>
                        ))}
                        <span className="ml-1.5 font-mono-tabular text-xs font-bold text-[#4A123F]">
                          {reviewRating}/5
                        </span>
                      </div>

                      <input
                        type="text"
                        maxLength={100}
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder="Seu nome"
                        className="w-full rounded-xl border border-[#781B68]/20 bg-white px-3 py-1.5 text-xs text-[#1A1216] focus:border-[#781B68] focus:outline-none"
                      />

                      <textarea
                        rows={2}
                        maxLength={800}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Conte o que achou deste produto..."
                        className="w-full rounded-xl border border-[#781B68]/20 bg-white px-3 py-1.5 text-xs text-[#1A1216] focus:border-[#781B68] focus:outline-none"
                      />

                      {reviewError && (
                        <p className="text-[11px] font-semibold text-red-700">{reviewError}</p>
                      )}

                      <button
                        type="button"
                        disabled={reviewSubmitting}
                        onClick={() => void handlePublishCatalogReview()}
                        className="da-btn-3d inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {reviewSubmitting ? 'Publicando...' : 'Publicar avaliação'}
                      </button>
                    </div>
                  ) : myProductReviews.length > 0 || reviewSuccess ? (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-emerald-700">
                        Sua avaliação registrada:
                      </p>
                      {myProductReviews.map((myRev) => (
                        <div
                          key={myRev.id}
                          className="rounded-xl border border-[#781B68]/12 bg-white p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`h-3 w-3 ${
                                    s <= myRev.rating
                                      ? 'fill-[#E6AE52] text-[#E6AE52]'
                                      : 'text-neutral-300'
                                  }`}
                                />
                              ))}
                            </div>
                            <span
                              className={`text-[10px] font-bold ${
                                myRev.status === 'approved'
                                  ? 'text-emerald-700'
                                  : myRev.status === 'rejected'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {myRev.status === 'approved'
                                ? 'Publicada'
                                : myRev.status === 'rejected'
                                ? 'Ocultada'
                                : 'Aguardando aprovação'}
                            </span>
                          </div>
                          <p className="text-[#3D2E35]">{myRev.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#5C4952]">
                      Conectado como <strong>{user.displayName || user.email}</strong>. A avaliação fica disponível assim que você realizar uma compra deste produto.
                    </p>
                  )}
                </div>

                {productReviews.length === 0 ? (
                  <p className="text-xs text-[#5C4952]">
                    Ainda não há avaliações públicas para este produto.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {productReviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-2xl border border-[#781B68]/15 bg-[#FFF5EB]/65 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#310D2B]">{rev.customerName}</span>
                          <span className="text-[#5C4952]">{formatDateBR(rev.createdAt)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3.5 w-3.5 ${
                                star <= rev.rating
                                  ? 'fill-[#E6AE52] text-[#E6AE52]'
                                  : 'text-neutral-300'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="mt-1.5 text-[#3D2E35] leading-relaxed">{rev.comment}</p>
                        {rev.adminReply && (
                          <div className="mt-2 rounded-xl bg-white p-2 border border-[#781B68]/12 text-[#4A123F]">
                            <span className="font-bold">Resposta Dois Amores: </span>
                            {rev.adminReply}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right column: Sizes, Bases, Addons, Notes */}
            <div className="lg:col-span-7 space-y-6">
              {product.sizes.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-[#310D2B]">1. Escolha o tamanho</h3>
                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {product.sizes.map((size) => {
                      const active = selectedSize?.id === size.id;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`flex min-h-[44px] items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left text-sm transition cursor-pointer ${
                            active
                              ? 'border-[#781B68] bg-[#4A123F]/8 text-[#4A123F] font-bold shadow-[0_0_12px_-4px_rgba(120,27,104,0.3)]'
                              : 'border-[#781B68]/15 text-[#1A1216] hover:bg-[#FFF5EB]/60'
                          }`}
                        >
                          <span className="truncate">{size.name}</span>
                          <span className="font-mono-tabular text-xs ml-2 shrink-0">
                            {size.priceDelta > 0 ? `+${formatBRL(size.priceDelta)}` : 'Incluso'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {product.bases.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-[#310D2B]">2. Escolha a base</h3>
                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {product.bases.map((base) => {
                      const active = selectedBase?.id === base.id;
                      return (
                        <button
                          key={base.id}
                          type="button"
                          onClick={() => setSelectedBase(base)}
                          className={`flex min-h-[44px] items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left text-sm transition cursor-pointer ${
                            active
                              ? 'border-[#781B68] bg-[#4A123F]/8 text-[#4A123F] font-bold shadow-[0_0_12px_-4px_rgba(120,27,104,0.3)]'
                              : 'border-[#781B68]/15 text-[#1A1216] hover:bg-[#FFF5EB]/60'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            {active && <Check className="h-4 w-4 shrink-0 text-[#781B68]" />}
                            {base.name}
                          </span>
                          <span className="font-mono-tabular text-xs ml-2 shrink-0">
                            {base.priceDelta > 0 ? `+${formatBRL(base.priceDelta)}` : 'Padrão'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {product.allowAddons && availableAddons.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[#310D2B]">
                    3. Adicionais e complementos
                  </h3>
                  {(Object.keys(groupedAddons) as AddonGroup[]).map((groupKey) => {
                    const list = groupedAddons[groupKey];
                    if (!list || list.length === 0) return null;
                    return (
                      <div key={groupKey} className="space-y-2">
                        <h4 className="text-xs font-bold text-[#781B68]">
                          {GROUP_LABELS[groupKey]}
                        </h4>
                        <div className="divide-y divide-[#781B68]/10 rounded-2xl border border-[#781B68]/15 bg-[#FFF5EB]/35">
                          {list.map((addon) => {
                            const qty = addonQtyMap[addon.id] || 0;
                            return (
                              <div
                                key={addon.id}
                                className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-[#1A1216] truncate">
                                    {addon.name}
                                  </div>
                                  <div className="font-mono-tabular text-xs font-semibold text-[#4A123F]">
                                    {addon.price > 0 ? `+ ${formatBRL(addon.price)}` : 'Grátis'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    disabled={qty === 0}
                                    onClick={() => updateAddonQty(addon, -1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#781B68]/20 bg-white text-[#310D2B] hover:bg-[#FFF5EB] disabled:opacity-40 cursor-pointer"
                                    aria-label={`Remover ${addon.name}`}
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="font-mono-tabular w-5 text-center text-sm font-bold text-[#310D2B]">
                                    {qty}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={qty >= (addon.maxQty || 2)}
                                    onClick={() => updateAddonQty(addon, 1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#781B68]/20 bg-white text-[#310D2B] hover:bg-[#FFF5EB] disabled:opacity-40 cursor-pointer"
                                    aria-label={`Adicionar ${addon.name}`}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-[#310D2B]">
                  Observações do item (opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: Enviar granola separada, sem banana..."
                  className="mt-2 w-full rounded-2xl border border-[#781B68]/25 bg-[#FFF5EB]/30 px-3.5 py-2.5 text-sm text-[#1A1216] placeholder:text-neutral-400 focus:border-[#781B68] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer purchase bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#781B68]/12 bg-[#FFF5EB] px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#781B68]/25 bg-white text-[#310D2B] hover:bg-[#4A123F]/5 active:scale-95 cursor-pointer"
              aria-label="Diminuir quantidade"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="font-mono-tabular w-6 text-center text-base font-extrabold text-[#310D2B]">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(30, q + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#781B68]/25 bg-white text-[#310D2B] hover:bg-[#4A123F]/5 active:scale-95 cursor-pointer"
              aria-label="Aumentar quantidade"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="da-btn-gold flex-1 sm:flex-none inline-flex min-h-[46px] items-center justify-center gap-4 rounded-2xl px-6 py-3 text-sm font-extrabold cursor-pointer"
          >
            <span>{editingItem ? 'Salvar alterações' : 'Adicionar à sacola'}</span>
            <span className="font-mono-tabular font-extrabold">{formatBRL(lineTotal)}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

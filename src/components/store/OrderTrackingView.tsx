import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  PackageCheck,
  QrCode,
  Send,
  Star,
  Store,
  Truck,
  XCircle,
} from 'lucide-react';
import type { LocalTrackedOrderRef, OrderTracking, StoreSettings } from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { useStoreData } from '../../hooks/useStoreData.tsx';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import {
  formatBRL,
  formatDateTimeBR,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../lib/formatters.ts';

interface OrderTrackingViewProps {
  settings: StoreSettings;
  trackedRefs: LocalTrackedOrderRef[];
  activeTrackingId: string | null;
  onSelectTrackingId: (trackingId: string) => void;
  onBackToStore: () => void;
}

const DELIVERY_STEPS = [
  { key: 'received', label: 'Pedido recebido' },
  { key: 'confirmed', label: 'Pedido confirmado' },
  { key: 'preparing', label: 'Em preparação' },
  { key: 'out_for_delivery', label: 'Saiu para entrega' },
  { key: 'completed', label: 'Pedido entregue' },
];

const PICKUP_STEPS = [
  { key: 'received', label: 'Pedido recebido' },
  { key: 'confirmed', label: 'Pedido confirmado' },
  { key: 'preparing', label: 'Em preparação' },
  { key: 'ready', label: 'Pronto para retirada' },
  { key: 'completed', label: 'Retirado pelo cliente' },
];

interface ProductReviewDraft {
  rating: number;
  comment: string;
  customerName: string;
  submitting: boolean;
  submittedStatus: 'pending' | 'approved' | 'rejected' | null;
  error: string | null;
}

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  settings,
  trackedRefs,
  activeTrackingId,
  onSelectTrackingId,
  onBackToStore,
}) => {
  const { user, signInWithGoogle } = useAuth();
  const { customerOrders } = useStoreData();
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ProductReviewDraft>>({});

  const mergedOrderRefs = useMemo(() => {
    const map = new Map<string, LocalTrackedOrderRef>();
    for (const ref of trackedRefs) {
      map.set(ref.trackingId, ref);
    }
    for (const ord of customerOrders) {
      if (ord.trackingId && !map.has(ord.trackingId)) {
        map.set(ord.trackingId, {
          orderId: ord.id,
          trackingId: ord.trackingId,
          orderNumber: ord.orderNumber,
          createdAtIso: '',
        });
      }
    }
    return Array.from(map.values());
  }, [trackedRefs, customerOrders]);

  useEffect(() => {
    if (!activeTrackingId && mergedOrderRefs.length > 0) {
      onSelectTrackingId(mergedOrderRefs[0].trackingId);
    }
  }, [activeTrackingId, mergedOrderRefs, onSelectTrackingId]);

  useEffect(() => {
    if (!activeTrackingId) {
      setTracking(null);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'orderTracking', activeTrackingId),
      (snap) => {
        if (snap.exists()) {
          setTracking({ ...(snap.data() as OrderTracking), id: snap.id });
        } else {
          setTracking(null);
        }
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.GET, `orderTracking/${activeTrackingId}`);
      }
    );
    return () => unsub();
  }, [activeTrackingId]);

  // Check if reviews already exist for this order's products
  useEffect(() => {
    if (!tracking) return;
    const checkExistingReviews = async () => {
      const next: Record<string, ProductReviewDraft> = {};
      for (const item of tracking.itemsSummary) {
        const revId = `${tracking.orderId}_${item.productId}`;
        try {
          const snap = await getDoc(doc(db, 'reviews', revId));
          if (snap.exists()) {
            const data = snap.data() as { status: 'pending' | 'approved' | 'rejected'; rating: number; comment: string; customerName: string };
            next[item.productId] = {
              rating: data.rating,
              comment: data.comment,
              customerName: data.customerName,
              submitting: false,
              submittedStatus: data.status,
              error: null,
            };
          } else {
            next[item.productId] = {
              rating: 5,
              comment: '',
              customerName: user?.displayName || '',
              submitting: false,
              submittedStatus: null,
              error: null,
            };
          }
        } catch {
          // If pending review cannot be read by non-admin due to moderation rules, keep clean form
          next[item.productId] = {
            rating: 5,
            comment: '',
            customerName: user?.displayName || '',
            submitting: false,
            submittedStatus: null,
            error: null,
          };
        }
      }
      setReviewDrafts(next);
    };
    void checkExistingReviews();
  }, [tracking, user?.displayName]);

  const handleSubmitReview = async (productId: string, productName: string) => {
    if (!tracking) return;
    const draft = reviewDrafts[productId];
    if (!draft) return;

    const cleanName = draft.customerName.trim();
    const cleanComment = draft.comment.trim();
    if (cleanName.length < 2) {
      setReviewDrafts((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], error: 'Informe seu nome para publicar.' },
      }));
      return;
    }
    if (cleanComment.length < 3) {
      setReviewDrafts((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], error: 'Escreva um breve comentário (mín. 3 letras).' },
      }));
      return;
    }

    setReviewDrafts((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], submitting: true, error: null },
    }));

    const reviewId = `${tracking.orderId}_${productId}`;
    try {
      await setDoc(doc(db, 'reviews', reviewId), {
        productId,
        productName,
        orderId: tracking.orderId,
        trackingId: tracking.id,
        customerUid: user?.emailVerified ? user.uid : null,
        customerName: cleanName,
        rating: Math.min(5, Math.max(1, Math.round(draft.rating))),
        comment: cleanComment,
        status: 'pending',
        adminReply: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setReviewDrafts((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], submitting: false, submittedStatus: 'pending', error: null },
      }));
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('already exists')
          ? 'Você já avaliou este produto neste pedido.'
          : 'Não foi possível enviar sua avaliação agora. Caso já tenha avaliado este item neste pedido, aguarde a moderação.';
      setReviewDrafts((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], submitting: false, error: message },
      }));
    }
  };

  const steps = tracking?.modality === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const activeStepIndex = tracking
    ? steps.findIndex((s) => s.key === tracking.status)
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToStore}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-[#1A1216] hover:bg-neutral-50 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a loja
        </button>

        {mergedOrderRefs.length > 1 && (
          <select
            value={activeTrackingId || ''}
            onChange={(e) => onSelectTrackingId(e.target.value)}
            className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-[#1A1216]"
          >
            {mergedOrderRefs.map((ref) => (
              <option key={ref.trackingId} value={ref.trackingId}>
                Pedido {ref.orderNumber}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-[#5C4952]">
          Carregando atualização em tempo real do seu pedido...
        </div>
      )}

      {!loading && !tracking && (
        <div className="da-card-3d rounded-3xl p-8 text-center space-y-4">
          <PackageCheck className="mx-auto h-10 w-10 text-[#781B68]" />
          <div>
            <h2 className="font-display text-xl font-bold text-[#310D2B]">
              Nenhum pedido selecionado
            </h2>
            <p className="mt-1 text-sm text-[#5C4952]">
              Finalize um pedido na loja para acompanhar o preparo e avaliar os produtos aqui em tempo real.
            </p>
          </div>
          {!user && (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="da-btn-3d inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5 text-[#E6AE52]" />
              Entrar com Google para ver seus pedidos
            </button>
          )}
        </div>
      )}

      {tracking && (
        <div className="space-y-6">
          {/* Status Card */}
          <div className="da-card-3d rounded-3xl p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#5C4952]">
                  {tracking.modality === 'pickup' ? (
                    <>
                      <Store className="h-4 w-4 text-[#4A1230]" />
                      <span>Retirada na loja</span>
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4 text-[#4A1230]" />
                      <span>Entrega em domicílio</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{formatDateTimeBR(tracking.createdAt)}</span>
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold text-[#1A1216]">
                  Pedido <span className="font-mono-tabular text-[#4A1230]">{tracking.orderNumber}</span>
                </h1>
              </div>

              <div className="text-right">
                <div className="text-xs text-[#5C4952]">Previsão estimada</div>
                <div className="mt-0.5 inline-flex items-center gap-1.5 font-mono-tabular text-sm font-bold text-[#1A1216]">
                  <Clock className="h-4 w-4 text-[#4A1230]" />
                  ~{tracking.estimatedMinutes} min
                </div>
              </div>
            </div>

            {tracking.status === 'cancelled' ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
                <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sm">Pedido cancelado</div>
                  {tracking.cancelReason && (
                    <p className="mt-1 text-xs">Motivo: {tracking.cancelReason}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {steps.map((step, idx) => {
                  const done = idx <= activeStepIndex;
                  const current = idx === activeStepIndex;
                  return (
                    <div
                      key={step.key}
                      className={`rounded-xl border p-3 transition ${
                        current
                          ? 'border-[var(--brand-primary)] bg-[#4A1230]/5'
                          : done
                          ? 'border-emerald-200 bg-emerald-50/70'
                          : 'border-neutral-200 bg-neutral-50/50 opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono-tabular text-xs font-bold text-[#5C4952]">
                          0{idx + 1}
                        </span>
                        {done && (
                          <CheckCircle2
                            className={`h-4 w-4 ${
                              current ? 'text-[#4A1230]' : 'text-emerald-600'
                            }`}
                          />
                        )}
                      </div>
                      <div className="mt-2 text-xs font-bold text-[#1A1216]">{step.label}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payment Details */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-[#FAF7F4] p-4 text-sm">
              <div>
                <div className="text-xs font-medium text-[#5C4952]">Pagamento</div>
                <div className="font-semibold text-[#1A1216]">
                  {PAYMENT_METHOD_LABELS[tracking.paymentMethod]} ·{' '}
                  <span
                    className={
                      tracking.paymentStatus === 'paid'
                        ? 'text-emerald-700'
                        : 'text-amber-800'
                    }
                  >
                    {PAYMENT_STATUS_LABELS[tracking.paymentStatus]}
                  </span>
                </div>
              </div>
              <div className="font-mono-tabular text-lg font-bold text-[#4A1230]">
                {formatBRL(tracking.total)}
              </div>
            </div>

            {tracking.paymentMethod === 'pix' &&
              tracking.paymentStatus === 'pending' &&
              settings.pixKey && (
                <div className="rounded-xl border border-[#4A1230]/20 bg-[#FAF7F4] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#4A1230]">
                    <QrCode className="h-4 w-4" />
                    Chave Pix para pagamento
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
                    <span className="font-mono-tabular text-xs sm:text-sm text-[#1A1216] break-all">
                      {settings.pixKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(settings.pixKey || '');
                        setCopiedPix(true);
                        setTimeout(() => setCopiedPix(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#4A1230] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedPix ? 'Copiada!' : 'Copiar chave'}
                    </button>
                  </div>
                  <p className="text-xs text-[#5C4952]">
                    Favorecido: {settings.pixReceiverName || settings.storeName}. A confirmação do pagamento ocorre somente após validação pelo estabelecimento ou webhook do provedor.
                  </p>
                </div>
              )}

            {/* Items Summary */}
            <div>
              <h3 className="text-sm font-bold text-[#1A1216]">Itens do pedido</h3>
              <ul className="mt-2 divide-y divide-neutral-100 border-t border-b border-neutral-100">
                {tracking.itemsSummary.map((item, idx) => (
                  <li key={`${item.productId}_${idx}`} className="flex justify-between py-2.5 text-sm">
                    <span className="text-[#3D2E35]">
                      <span className="font-mono-tabular font-semibold">{item.quantity}x</span>{' '}
                      {item.productName} ({item.sizeName})
                    </span>
                    <span className="font-mono-tabular font-semibold text-[#1A1216]">
                      {formatBRL(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Post-Purchase Product Reviews Module */}
          {tracking.status !== 'cancelled' && (
            <div className="da-card-3d rounded-3xl p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-[#310D2B]">
                  Avalie os produtos do seu pedido
                </h2>
                <p className="mt-1 text-sm text-[#4A3B42]">
                  Sua opinião ajuda outros clientes! Escolha de 1 a 5 estrelas e deixe um comentário para cada item adquirido.
                </p>
              </div>

              <div className="space-y-4">
                {Array.from(
                  new Map(tracking.itemsSummary.map((i) => [i.productId, i])).values()
                ).map((item) => {
                  const draft = reviewDrafts[item.productId] || {
                    rating: 5,
                    comment: '',
                    customerName: '',
                    submitting: false,
                    submittedStatus: null,
                    error: null,
                  };

                  return (
                    <div
                      key={item.productId}
                      className="rounded-xl border border-neutral-200 bg-[#FAF7F4] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#1A1216]">{item.productName}</h3>
                        {draft.submittedStatus && (
                          <span className="text-xs font-semibold text-emerald-700">
                            {draft.submittedStatus === 'approved'
                              ? 'Avaliação publicada'
                              : 'Avaliação enviada para moderação'}
                          </span>
                        )}
                      </div>

                      {draft.submittedStatus ? (
                        <div className="space-y-1.5 text-sm text-[#3D2E35]">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`h-4 w-4 ${
                                  s <= draft.rating
                                    ? 'fill-[#C89B3C] text-[#C89B3C]'
                                    : 'text-neutral-300'
                                }`}
                              />
                            ))}
                          </div>
                          <p>{draft.comment}</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#5C4952] mr-2">Nota:</span>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() =>
                                  setReviewDrafts((prev) => ({
                                    ...prev,
                                    [item.productId]: { ...draft, rating: star },
                                  }))
                                }
                                className="p-1 cursor-pointer"
                                aria-label={`Nota ${star} estrelas`}
                              >
                                <Star
                                  className={`h-6 w-6 transition ${
                                    star <= draft.rating
                                      ? 'fill-[#C89B3C] text-[#C89B3C]'
                                      : 'text-neutral-300 hover:text-[#C89B3C]'
                                  }`}
                                />
                              </button>
                            ))}
                            <span className="font-mono-tabular text-xs font-bold text-[#4A1230] ml-2">
                              {draft.rating}/5
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <input
                                type="text"
                                maxLength={100}
                                value={draft.customerName}
                                onChange={(e) =>
                                  setReviewDrafts((prev) => ({
                                    ...prev,
                                    [item.productId]: { ...draft, customerName: e.target.value },
                                  }))
                                }
                                placeholder="Seu nome"
                                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <input
                                type="text"
                                maxLength={800}
                                value={draft.comment}
                                onChange={(e) =>
                                  setReviewDrafts((prev) => ({
                                    ...prev,
                                    [item.productId]: { ...draft, comment: e.target.value },
                                  }))
                                }
                                placeholder="Conte o que achou deste produto..."
                                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                              />
                            </div>
                          </div>

                          {draft.error && (
                            <p className="text-xs font-medium text-red-700">{draft.error}</p>
                          )}

                          <button
                            type="button"
                            disabled={draft.submitting}
                            onClick={() => void handleSubmitReview(item.productId, item.productName)}
                            className="da-btn-3d inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50 cursor-pointer"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {draft.submitting ? 'Enviando...' : 'Enviar avaliação'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

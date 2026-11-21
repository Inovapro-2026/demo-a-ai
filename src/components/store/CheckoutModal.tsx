import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Banknote, CheckCircle2, CreditCard, MapPin, QrCode, Store, Truck, X } from 'lucide-react';
import type {
  CartItem,
  Coupon,
  LocalTrackedOrderRef,
  OrderModality,
  PaymentMethod,
  StoreSettings,
} from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL } from '../../lib/formatters.ts';

interface CheckoutModalProps {
  items: CartItem[];
  settings: StoreSettings;
  appliedCoupon: Coupon | null;
  onClose: () => void;
  onOrderCreated: (ref: LocalTrackedOrderRef) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  items,
  settings,
  appliedCoupon,
  onClose,
  onOrderCreated,
}) => {
  const { user } = useAuth();
  const [modality, setModality] = useState<OrderModality>(
    settings.deliveryEnabled ? 'delivery' : 'pickup'
  );
  const [customerName, setCustomerName] = useState(user?.displayName || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState(
    settings.neighborhoodFees?.[0]?.neighborhood || ''
  );
  const [reference, setReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    settings.pixEnabled ? 'pix' : settings.cardEnabled ? 'card' : 'cash'
  );
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  const subtotal = useMemo(() => items.reduce((acc, i) => acc + i.lineTotal, 0), [items]);
  const discount = useMemo(() => {
    if (!appliedCoupon || subtotal < appliedCoupon.minOrderValue) return 0;
    return appliedCoupon.type === 'percent'
      ? (subtotal * appliedCoupon.value) / 100
      : Math.min(subtotal, appliedCoupon.value);
  }, [appliedCoupon, subtotal]);

  const deliveryFee = useMemo(() => {
    if (modality === 'pickup') return 0;
    const clean = neighborhood.trim().toLowerCase();
    const matched = (settings.neighborhoodFees || []).find(
      (n) => n.neighborhood.trim().toLowerCase() === clean
    );
    return matched ? Number(matched.fee) : Number(settings.deliveryFeeFixed || 0);
  }, [modality, neighborhood, settings]);

  const estimatedTotal = Math.max(0, subtotal - discount + deliveryFee);

  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    setCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      if (resp.ok) {
        const data = (await resp.json()) as {
          erro?: boolean;
          logradouro?: string;
          bairro?: string;
        };
        if (!data.erro) {
          if (data.logradouro && !address) setAddress(data.logradouro);
          if (data.bairro && !neighborhood) setNeighborhood(data.bairro);
        }
      }
    } catch {
      // silent CEP fallback
    } finally {
      setCepLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);

    if (customerName.trim().length < 2) {
      setErrorMsg('Informe seu nome completo.');
      return;
    }
    if (customerPhone.replace(/\D/g, '').length < 8) {
      setErrorMsg('Informe um telefone/WhatsApp válido.');
      return;
    }
    if (modality === 'delivery') {
      if (!address.trim() || !number.trim() || !neighborhood.trim()) {
        setErrorMsg('Preencha endereço, número e bairro para entrega.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const prepareResp = await fetch('/api/orders/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            sizeId: i.size?.id || null,
            baseId: i.base?.id || null,
            addons: i.addons.map((a) => ({ addonId: a.addonId, qty: a.qty })),
            quantity: i.quantity,
            notes: i.notes,
          })),
          couponCode: appliedCoupon?.code || '',
          modality,
          neighborhood,
          paymentMethod,
          customerPhone,
        }),
      });

      const prepared = await prepareResp.json();
      if (!prepareResp.ok) {
        setErrorMsg(prepared.error || 'Erro ao validar valores do pedido.');
        setSubmitting(false);
        return;
      }

      const batch = writeBatch(db);
      const orderRef = doc(db, 'orders', prepared.orderId);
      const trackingRef = doc(db, 'orderTracking', prepared.trackingId);

      const parsedChange =
        paymentMethod === 'cash' && changeFor.trim()
          ? Number(changeFor.replace(',', '.'))
          : null;

      batch.set(orderRef, {
        orderNumber: prepared.orderNumber,
        trackingId: prepared.trackingId,
        customerUid: user?.emailVerified ? user.uid : null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        modality,
        cep: modality === 'delivery' ? cep.trim() : '',
        address: modality === 'delivery' ? address.trim() : '',
        number: modality === 'delivery' ? number.trim() : '',
        complement: modality === 'delivery' ? complement.trim() : '',
        neighborhood: modality === 'delivery' ? neighborhood.trim() : '',
        reference: modality === 'delivery' ? reference.trim() : '',
        paymentMethod,
        paymentStatus: 'pending',
        changeFor: parsedChange && Number.isFinite(parsedChange) ? parsedChange : null,
        status: 'received',
        cancelReason: '',
        couponCode: prepared.couponCode || '',
        subtotal: prepared.subtotal,
        discount: prepared.discount,
        deliveryFee: prepared.deliveryFee,
        paymentFee: prepared.paymentFee,
        total: prepared.total,
        items: prepared.items,
        notes: notes.trim(),
        priceDigest: prepared.priceDigest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(trackingRef, {
        orderId: prepared.orderId,
        orderNumber: prepared.orderNumber,
        modality,
        status: 'received',
        paymentMethod,
        paymentStatus: 'pending',
        cancelReason: '',
        total: prepared.total,
        estimatedMinutes: prepared.estimatedMinutes,
        itemsSummary: prepared.itemsSummary,
        productIds: prepared.productIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `orders/${prepared.orderId}`);
      }

      onOrderCreated({
        orderId: prepared.orderId,
        trackingId: prepared.trackingId,
        orderNumber: prepared.orderNumber,
        createdAtIso: new Date().toISOString(),
      });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Erro ao finalizar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1E081B]/65 backdrop-blur-[2px] p-0 sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_28px_60px_-14px_rgba(49,13,43,0.45)] border border-[#781B68]/25">
        <div className="flex items-center justify-between border-b border-[#781B68]/12 bg-[#FFF5EB]/60 px-5 py-4">
          <h2 className="font-display text-xl font-bold text-[#310D2B]">Finalizar Pedido</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 cursor-pointer"
            aria-label="Fechar checkout"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Modality */}
          <div>
            <label className="block text-sm font-bold text-[#1A1216]">1. Como deseja receber?</label>
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {settings.deliveryEnabled && (
                <button
                  type="button"
                  onClick={() => setModality('delivery')}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition cursor-pointer ${
                    modality === 'delivery'
                      ? 'border-[var(--brand-primary)] bg-[#4A1230]/5 text-[#4A1230]'
                      : 'border-neutral-200 text-[#1A1216] hover:bg-neutral-50'
                  }`}
                >
                  <Truck className="h-5 w-5 shrink-0" />
                  <div>
                    <div className="text-sm font-bold">Entrega</div>
                    <div className="text-xs text-[#5C4952]">
                      Estimativa ~{settings.estimatedDeliveryMinutes} min
                    </div>
                  </div>
                </button>
              )}

              {settings.pickupEnabled && (
                <button
                  type="button"
                  onClick={() => setModality('pickup')}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition cursor-pointer ${
                    modality === 'pickup'
                      ? 'border-[var(--brand-primary)] bg-[#4A1230]/5 text-[#4A1230]'
                      : 'border-neutral-200 text-[#1A1216] hover:bg-neutral-50'
                  }`}
                >
                  <Store className="h-5 w-5 shrink-0" />
                  <div>
                    <div className="text-sm font-bold">Retirada na loja</div>
                    <div className="text-xs text-[#5C4952]">Sem taxa de entrega</div>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1A1216]">Nome completo *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Seu nome"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1A1216]">Telefone / WhatsApp *</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
              />
            </div>
          </div>

          {/* Delivery Address */}
          {modality === 'delivery' ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-[#FAF7F4] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1A1216]">
                <MapPin className="h-4 w-4 text-[var(--brand-primary)]" />
                Endereço de Entrega
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">
                    CEP {cepLoading ? '(buscando...)' : ''}
                  </label>
                  <input
                    type="text"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    onBlur={() => void handleCepBlur()}
                    placeholder="00000-000"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1A1216]">Bairro *</label>
                  <input
                    type="text"
                    required
                    list="dois-amores-bairros"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder="Selecione ou digite o bairro"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                  <datalist id="dois-amores-bairros">
                    {(settings.neighborhoodFees || []).map((nf) => (
                      <option key={nf.neighborhood} value={nf.neighborhood}>
                        {nf.neighborhood} ({formatBRL(nf.fee)})
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#1A1216]">Endereço / Rua *</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Nome da rua ou avenida"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">Número *</label>
                  <input
                    type="text"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="123"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">Complemento</label>
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Apto, bloco, casa..."
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">Ponto de referência</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Próximo à praça..."
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-[#FAF7F4] p-4 text-sm text-[#3D2E35]">
              <p className="font-bold text-[#1A1216]">Retirada no balcão</p>
              <p className="mt-1">{settings.address}</p>
              <p className="mt-0.5 text-xs text-[#5C4952]">
                Horário: {settings.openingDays}, {settings.openingHours}
              </p>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-bold text-[#1A1216]">2. Forma de pagamento</label>
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {settings.pixEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('pix')}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left text-sm transition cursor-pointer ${
                    paymentMethod === 'pix'
                      ? 'border-[var(--brand-primary)] bg-[#4A1230]/5 text-[#4A1230] font-semibold'
                      : 'border-neutral-200 text-[#1A1216] hover:bg-neutral-50'
                  }`}
                >
                  <QrCode className="h-4 w-4 shrink-0" />
                  <span>Pix</span>
                </button>
              )}
              {settings.cardEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left text-sm transition cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'border-[var(--brand-primary)] bg-[#4A1230]/5 text-[#4A1230] font-semibold'
                      : 'border-neutral-200 text-[#1A1216] hover:bg-neutral-50'
                  }`}
                >
                  <CreditCard className="h-4 w-4 shrink-0" />
                  <span>Cartão na {modality === 'pickup' ? 'retirada' : 'entrega'}</span>
                </button>
              )}
              {settings.cashEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left text-sm transition cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'border-[var(--brand-primary)] bg-[#4A1230]/5 text-[#4A1230] font-semibold'
                      : 'border-neutral-200 text-[#1A1216] hover:bg-neutral-50'
                  }`}
                >
                  <Banknote className="h-4 w-4 shrink-0" />
                  <span>Dinheiro</span>
                </button>
              )}
            </div>

            {paymentMethod === 'cash' && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-[#1A1216]">
                  Troco para quanto? (deixe em branco se não precisar)
                </label>
                <input
                  type="text"
                  value={changeFor}
                  onChange={(e) => setChangeFor(e.target.value)}
                  placeholder="Ex.: 50,00"
                  className="mt-1 w-full max-w-xs rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                />
              </div>
            )}

            {paymentMethod === 'pix' && (
              <div className="mt-3 rounded-xl border border-neutral-200 bg-[#FAF7F4] p-3 text-xs text-[#3D2E35]">
                Após enviar o pedido, a chave Pix será exibida na tela de acompanhamento. O pagamento é confirmado somente após validação do recebedor ou webhook do provedor.
              </div>
            )}
          </div>

          {/* General Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Observações gerais</label>
            <input
              type="text"
              maxLength={350}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interfone, instruções para o entregador..."
              className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>

          {/* Totals Summary */}
          <div className="rounded-2xl border border-neutral-200 bg-[#FAF7F4] p-4 space-y-2 text-sm">
            <div className="flex justify-between text-[#43353C]">
              <span>Subtotal ({items.reduce((a, b) => a + b.quantity, 0)} itens)</span>
              <span className="font-mono-tabular">{formatBRL(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto ({appliedCoupon?.code})</span>
                <span className="font-mono-tabular">-{formatBRL(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#43353C]">
              <span>Taxa de entrega</span>
              <span className="font-mono-tabular">
                {modality === 'pickup' ? 'Grátis' : formatBRL(deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-bold text-[#1A1216]">
              <span>Total estimado</span>
              <span className="font-mono-tabular text-[#4A1230]">{formatBRL(estimatedTotal)}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="da-btn-gold w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold disabled:opacity-60 cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? 'Validando e registrando pedido...' : 'Confirmar Pedido'}
          </button>
        </form>
      </div>
    </div>
  );
};

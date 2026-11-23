import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  Lock,
  MapPin,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import type {
  CartItem,
  Coupon,
  LocalTrackedOrderRef,
  OrderModality,
  PaymentMethod,
  StoreSettings,
} from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { useStoreData } from '../../hooks/useStoreData.tsx';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL } from '../../lib/formatters.ts';

interface CheckoutModalProps {
  items: CartItem[];
  settings: StoreSettings;
  appliedCoupon: Coupon | null;
  onClose: () => void;
  onOrderCreated: (ref: LocalTrackedOrderRef) => void;
}

interface PreparedOrderPayload {
  orderId: string;
  orderNumber: string;
  trackingId: string;
  couponCode: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  paymentFee: number;
  total: number;
  items: Array<{
    productId: string;
    productName: string;
    sizeName: string;
    baseName: string;
    addons: Array<{ addonId: string; name: string; price: number; qty: number }>;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    notes: string;
  }>;
  itemsSummary: Array<{
    productId: string;
    productName: string;
    sizeName: string;
    quantity: number;
    lineTotal: number;
  }>;
  productIds: string[];
  estimatedMinutes: number;
  priceDigest: string;
  source: 'server' | 'local';
}

function randomHex(bytesLen: number): string {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function parseJsonSafe<T>(resp: Response): Promise<T | null> {
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  try {
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

const SimulatedQrSvg: React.FC<{ seed: string }> = ({ seed }) => {
  const cells = useMemo(() => {
    const size = 21;
    const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
    const drawFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r][c0 + c] = border || inner;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inFinder =
          (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);
        if (inFinder) continue;
        hash ^= (r * 31 + c * 17) & 0xff;
        hash = Math.imul(hash, 16777619);
        grid[r][c] = (hash >>> 3) % 2 === 0;
      }
    }
    return grid;
  }, [seed]);

  return (
    <svg
      viewBox="0 0 21 21"
      className="h-36 w-36 rounded-xl bg-white p-2 shadow-sm border border-[#781B68]/20"
      aria-label="QR Code Pix simulado"
    >
      {cells.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#310D2B" /> : null
        )
      )}
    </svg>
  );
};

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  items,
  settings,
  appliedCoupon,
  onClose,
  onOrderCreated,
}) => {
  const { user } = useAuth();
  const { products, addons } = useStoreData();

  const [step, setStep] = useState<'form' | 'simulator'>('form');
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

  // Payment Simulator states
  const [preparedOrder, setPreparedOrder] = useState<PreparedOrderPayload | null>(null);
  const [copiedPixCode, setCopiedPixCode] = useState(false);
  const [cardMode, setCardMode] = useState<'credit_1x' | 'credit_2x' | 'credit_3x' | 'debit'>('credit_1x');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [simulatingAction, setSimulatingAction] = useState<string | null>(null);
  const [simulatorError, setSimulatorError] = useState<string | null>(null);

  const subtotal = useMemo(() => items.reduce((acc, i) => acc + i.lineTotal, 0), [items]);
  const discount = useMemo(() => {
    if (!appliedCoupon || subtotal < appliedCoupon.minOrderValue) return 0;
    return appliedCoupon.type === 'percent'
      ? Number(((subtotal * appliedCoupon.value) / 100).toFixed(2))
      : Number(Math.min(subtotal, appliedCoupon.value).toFixed(2));
  }, [appliedCoupon, subtotal]);

  const deliveryFee = useMemo(() => {
    if (modality === 'pickup') return 0;
    const clean = neighborhood.trim().toLowerCase();
    const matched = (settings.neighborhoodFees || []).find(
      (n) => n.neighborhood.trim().toLowerCase() === clean
    );
    return matched ? Number(matched.fee) : Number(settings.deliveryFeeFixed || 0);
  }, [modality, neighborhood, settings]);

  const estimatedTotal = Math.max(0, Number((subtotal - discount + deliveryFee).toFixed(2)));

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

  const buildLocalPreparedOrder = (): PreparedOrderPayload | { error: string } => {
    if (!settings.isOpen || settings.pauseOrders) {
      return {
        error:
          settings.closedMessage ||
          'A loja está fechada ou pausada para pedidos no momento.',
      };
    }

    if (modality === 'delivery' && !settings.deliveryEnabled) {
      return { error: 'Entrega indisponível no momento.' };
    }
    if (modality === 'pickup' && !settings.pickupEnabled) {
      return { error: 'Retirada no balcão indisponível no momento.' };
    }

    const productsMap = new Map(products.map((p) => [p.id, p]));
    const addonsMap = new Map(addons.map((a) => [a.id, a]));

    const verifiedItems: PreparedOrderPayload['items'] = [];
    let computedSubtotal = 0;

    for (const item of items) {
      const prod = productsMap.get(item.productId);
      if (prod && (prod.archived || !prod.available)) {
        return { error: `O produto ${prod.name} não está mais disponível.` };
      }

      const basePrice = prod
        ? typeof prod.promoPrice === 'number' &&
          prod.promoPrice > 0 &&
          prod.promoPrice < prod.price
          ? prod.promoPrice
          : prod.price
        : item.unitBasePrice;

      let sizeDelta = item.size?.priceDelta || 0;
      let sizeName = item.size?.name || 'Padrão';
      if (prod && prod.sizes && prod.sizes.length > 0) {
        const matchedSize = prod.sizes.find((s) => s.id === item.size?.id) || prod.sizes[0];
        sizeDelta = Number(matchedSize.priceDelta) || 0;
        sizeName = matchedSize.name;
      }

      let baseDelta = item.base?.priceDelta || 0;
      let baseName = item.base?.name || 'Tradicional';
      if (prod && prod.bases && prod.bases.length > 0) {
        const matchedBase = prod.bases.find((b) => b.id === item.base?.id) || prod.bases[0];
        baseDelta = Number(matchedBase.priceDelta) || 0;
        baseName = matchedBase.name;
      }

      let addonsUnitTotal = 0;
      const verifiedAddons = item.addons.map((a) => {
        const liveAddon = addonsMap.get(a.addonId);
        const unitAddonPrice = liveAddon ? Number(liveAddon.price) : Number(a.price);
        addonsUnitTotal += unitAddonPrice * a.qty;
        return {
          addonId: a.addonId,
          name: liveAddon ? liveAddon.name : a.name,
          price: unitAddonPrice,
          qty: a.qty,
        };
      });

      const unitPrice = prod
        ? Number((basePrice + sizeDelta + baseDelta + addonsUnitTotal).toFixed(2))
        : Number(
            (item.quantity > 0 ? item.lineTotal / item.quantity : item.unitBasePrice).toFixed(2)
          );
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
      computedSubtotal = Number((computedSubtotal + lineTotal).toFixed(2));

      verifiedItems.push({
        productId: item.productId,
        productName: prod ? prod.name : item.productName,
        sizeName,
        baseName,
        addons: verifiedAddons,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        notes: (item.notes || '').slice(0, 200),
      });
    }

    if (computedSubtotal < Number(settings.minOrderValue || 0)) {
      return {
        error: `O pedido mínimo é de R$ ${Number(settings.minOrderValue).toFixed(2).replace('.', ',')}.`,
      };
    }

    let computedDiscount = 0;
    let normalizedCoupon = '';
    if (appliedCoupon && appliedCoupon.active && computedSubtotal >= appliedCoupon.minOrderValue) {
      normalizedCoupon = appliedCoupon.code;
      computedDiscount =
        appliedCoupon.type === 'percent'
          ? Number(((computedSubtotal * appliedCoupon.value) / 100).toFixed(2))
          : Number(Math.min(computedSubtotal, appliedCoupon.value).toFixed(2));
    }

    const computedTotal = Number(
      Math.max(0, computedSubtotal - computedDiscount + deliveryFee).toFixed(2)
    );
    const orderId = `ord_${Date.now()}_${randomHex(4)}`;
    const orderNumber = `DA-${String(Math.floor(1000 + (Date.now() % 9000)))}`;
    const trackingId = `${orderId}_${randomHex(12)}`;

    return {
      orderId,
      orderNumber,
      trackingId,
      couponCode: normalizedCoupon,
      subtotal: computedSubtotal,
      discount: computedDiscount,
      deliveryFee,
      paymentFee: 0,
      total: computedTotal,
      items: verifiedItems,
      itemsSummary: verifiedItems.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        sizeName: it.sizeName,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
      })),
      productIds: Array.from(new Set(verifiedItems.map((it) => it.productId))),
      estimatedMinutes:
        modality === 'pickup'
          ? Math.max(15, Math.round((settings.estimatedDeliveryMinutes || 30) * 0.6))
          : Number(settings.estimatedDeliveryMinutes || 35),
      priceDigest: `local_${randomHex(16)}`,
      source: 'local',
    };
  };

  const handlePrepareAndGoToSimulator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setSimulatorError(null);

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
      let prepared: PreparedOrderPayload | null = null;

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

        const parsed = await parseJsonSafe<PreparedOrderPayload & { error?: string }>(prepareResp);
        if (parsed) {
          if (!prepareResp.ok) {
            setErrorMsg(parsed.error || 'Erro ao validar valores do pedido.');
            return;
          }
          prepared = { ...parsed, source: 'server' };
        }
      } catch {
        // Network / static hosting fallback handled below
      }

      if (!prepared) {
        const localResult = buildLocalPreparedOrder();
        if ('error' in localResult) {
          setErrorMsg(localResult.error);
          return;
        }
        prepared = localResult;
      }

      setPreparedOrder(prepared);
      setStep('simulator');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Erro ao preparar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const commitOrderToAdmin = async (
    mode: 'paid_sim' | 'pending' | 'declined_sim'
  ) => {
    if (!preparedOrder || simulatingAction) return;
    setSimulatorError(null);

    if (mode === 'paid_sim' && paymentMethod === 'card') {
      const cleanCardDigits = cardNumber.replace(/\D/g, '');
      if (cleanCardDigits.length < 12 || cardHolder.trim().length < 2 || !cardExpiry.trim() || cardCvv.trim().length < 3) {
        setSimulatorError('Preencha os dados do cartão de teste ou clique em "Preencher cartão de teste".');
        return;
      }
    }

    setSimulatingAction(mode);
    try {
      if (mode === 'declined_sim') {
        await new Promise((r) => setTimeout(r, 450));
        setSimulatorError(
          'Pagamento recusado pelo emissor simulado (código 51 - teste). Tente aprovar ou selecione Pix/Dinheiro.'
        );
        return;
      }

      let feeAmount = 0;
      let netAmount = preparedOrder.total;
      let providerRef = '';
      let paymentStatus: 'paid' | 'pending' = 'pending';

      if (mode === 'paid_sim') {
        paymentStatus = 'paid';
        type SimulatedPaymentResponse = {
          approved?: boolean;
          txId?: string;
          feeAmount?: number;
          netAmount?: number;
          providerRef?: string;
          error?: string;
        };
        let simulatedFromServer: SimulatedPaymentResponse | null = null;

        if (preparedOrder.source === 'server') {
          try {
            const simResp = await fetch('/api/payments/simulate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: preparedOrder.orderId,
                orderNumber: preparedOrder.orderNumber,
                paymentMethod,
                subtotal: preparedOrder.subtotal,
                discount: preparedOrder.discount,
                deliveryFee: preparedOrder.deliveryFee,
                total: preparedOrder.total,
                priceDigest: preparedOrder.priceDigest,
                outcome: 'approved',
              }),
            });
            const parsed = await parseJsonSafe<SimulatedPaymentResponse>(simResp);
            if (parsed) {
              if (!simResp.ok) {
                setSimulatorError(parsed.error || 'Não foi possível aprovar no simulador.');
                return;
              }
              simulatedFromServer = parsed;
            }
          } catch {
            // Fallback to deterministic local simulation below
          }
        }

        if (simulatedFromServer && simulatedFromServer.approved) {
          feeAmount = Number(simulatedFromServer.feeAmount || 0);
          netAmount = Number(simulatedFromServer.netAmount ?? preparedOrder.total);
          providerRef = String(simulatedFromServer.providerRef || '');
        } else {
          // Slight UX delay to feel like a real gateway approval on static hosting
          await new Promise((r) => setTimeout(r, 600));
          const feeRate = paymentMethod === 'card' ? 0.032 : paymentMethod === 'pix' ? 0.005 : 0;
          feeAmount = Number((preparedOrder.total * feeRate).toFixed(2));
          netAmount = Number((preparedOrder.total - feeAmount).toFixed(2));
          const txId = `SIM-${randomHex(4).toUpperCase()}`;
          const methodLabel =
            paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'card' ? 'Cartão' : 'Dinheiro';
          providerRef = `Simulador Demo (${methodLabel}) · ${txId}`;
        }
      }

      const batch = writeBatch(db);
      const orderRef = doc(db, 'orders', preparedOrder.orderId);
      const trackingRef = doc(db, 'orderTracking', preparedOrder.trackingId);

      const parsedChange =
        paymentMethod === 'cash' && changeFor.trim()
          ? Number(changeFor.replace(',', '.'))
          : null;

      batch.set(orderRef, {
        orderNumber: preparedOrder.orderNumber,
        trackingId: preparedOrder.trackingId,
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
        paymentStatus,
        changeFor: parsedChange && Number.isFinite(parsedChange) ? parsedChange : null,
        status: 'received',
        cancelReason: '',
        couponCode: preparedOrder.couponCode || '',
        subtotal: preparedOrder.subtotal,
        discount: preparedOrder.discount,
        deliveryFee: preparedOrder.deliveryFee,
        paymentFee: feeAmount,
        total: preparedOrder.total,
        items: preparedOrder.items,
        notes: notes.trim(),
        priceDigest: preparedOrder.priceDigest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(trackingRef, {
        orderId: preparedOrder.orderId,
        orderNumber: preparedOrder.orderNumber,
        modality,
        status: 'received',
        paymentMethod,
        paymentStatus,
        cancelReason: '',
        total: preparedOrder.total,
        estimatedMinutes: preparedOrder.estimatedMinutes,
        itemsSummary: preparedOrder.itemsSummary,
        productIds: preparedOrder.productIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (paymentStatus === 'paid') {
        const paymentRef = doc(db, 'payments', `pay_${preparedOrder.orderId}`);
        batch.set(paymentRef, {
          orderId: preparedOrder.orderId,
          orderNumber: preparedOrder.orderNumber,
          method: paymentMethod,
          amount: preparedOrder.total,
          feeAmount,
          netAmount,
          status: 'confirmed',
          providerRef,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `orders/${preparedOrder.orderId}`);
      }

      onOrderCreated({
        orderId: preparedOrder.orderId,
        trackingId: preparedOrder.trackingId,
        orderNumber: preparedOrder.orderNumber,
        createdAtIso: new Date().toISOString(),
      });
    } catch (error) {
      setSimulatorError(error instanceof Error ? error.message : 'Erro ao registrar pedido.');
    } finally {
      setSimulatingAction(null);
    }
  };

  const fillTestCard = () => {
    setCardNumber('4532 0199 8877 1234');
    setCardHolder((customerName.trim() || 'CLIENTE DEMO').toUpperCase().slice(0, 26));
    setCardExpiry('12/29');
    setCardCvv('123');
    setSimulatorError(null);
  };

  const simulatedPixCode = useMemo(() => {
    if (!preparedOrder) return '';
    const cleanTotal = preparedOrder.total.toFixed(2);
    return `00020126580014BR.GOV.BCB.PIX0128${settings.pixKey || 'contato@doisamores.com.br'}520400005303986540${cleanTotal.length}${cleanTotal}5802BR5911DOIS AMORES6009SAO PAULO62120508${preparedOrder.orderNumber.replace(/[^A-Z0-9]/g, '')}6304DEMO`;
  }, [preparedOrder, settings.pixKey]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1E081B]/65 backdrop-blur-[2px] p-0 sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_28px_60px_-14px_rgba(49,13,43,0.45)] border border-[#781B68]/25">
        <div className="flex items-center justify-between border-b border-[#781B68]/12 bg-[#FFF5EB]/60 px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-[#310D2B]">
              {step === 'form' ? 'Finalizar Pedido' : 'Simulador de Pagamentos'}
            </h2>
            <p className="text-xs text-[#5C4952]">
              {step === 'form'
                ? 'Etapa 1 de 2 · Dados e entrega'
                : `Etapa 2 de 2 · Pedido ${preparedOrder?.orderNumber || ''} · Gateway Demo`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 cursor-pointer"
            aria-label="Fechar checkout"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'form' ? (
          <form
            onSubmit={(e) => void handlePrepareAndGoToSimulator(e)}
            className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6"
          >
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
                    <span>Pix (Simulador)</span>
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
                    <span>Cartão (Simulador)</span>
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
              <ShieldCheck className="h-4 w-4" />
              {submitting ? 'Validando pedido...' : 'Continuar para Simulador de Pagamento'}
            </button>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Simulator Order Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#781B68]/20 bg-[#FFF5EB]/80 p-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#781B68]">
                  <Sparkles className="h-3.5 w-3.5 text-[#E6AE52]" />
                  Ambiente Demo · Envio direto para o Painel Admin
                </div>
                <div className="mt-1 text-sm font-bold text-[#310D2B]">
                  Pedido <span className="font-mono-tabular">{preparedOrder?.orderNumber}</span> ·{' '}
                  {customerName.trim()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold text-[#5C4952]">Total a pagar</div>
                <div className="font-mono-tabular text-xl font-extrabold text-[#4A123F]">
                  {formatBRL(preparedOrder?.total || 0)}
                </div>
              </div>
            </div>

            {/* Switch payment method inside simulator */}
            <div className="grid grid-cols-3 gap-2">
              {settings.pixEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('pix');
                    setSimulatorError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition cursor-pointer ${
                    paymentMethod === 'pix'
                      ? 'da-btn-3d text-white border-transparent'
                      : 'border-[#781B68]/20 bg-white text-[#4A123F] hover:bg-[#FFF5EB]'
                  }`}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  Pix
                </button>
              )}
              {settings.cardEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('card');
                    setSimulatorError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'da-btn-3d text-white border-transparent'
                      : 'border-[#781B68]/20 bg-white text-[#4A123F] hover:bg-[#FFF5EB]'
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Cartão
                </button>
              )}
              {settings.cashEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('cash');
                    setSimulatorError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'da-btn-3d text-white border-transparent'
                      : 'border-[#781B68]/20 bg-white text-[#4A123F] hover:bg-[#FFF5EB]'
                  }`}
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Dinheiro
                </button>
              )}
            </div>

            {/* PIX SIMULATOR */}
            {paymentMethod === 'pix' && (
              <div className="rounded-2xl border border-[#781B68]/20 bg-[#FAF7F4] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <SimulatedQrSvg seed={simulatedPixCode} />
                  <div className="flex-1 space-y-2 text-center sm:text-left">
                    <div className="text-sm font-bold text-[#310D2B]">
                      Pix Copia e Cola (Simulado)
                    </div>
                    <p className="text-xs text-[#5C4952]">
                      Favorecido: <strong>{settings.pixReceiverName || settings.storeName}</strong>
                      <br />
                      Chave: <span className="font-mono-tabular">{settings.pixKey || 'contato@doisamores.com.br'}</span>
                    </p>
                    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                      <span className="font-mono-tabular text-[11px] text-[#3D2E35] truncate flex-1">
                        {simulatedPixCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(simulatedPixCode);
                          setCopiedPixCode(true);
                          setTimeout(() => setCopiedPixCode(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#4A123F] px-2.5 py-1 text-[11px] font-bold text-white shrink-0 cursor-pointer"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedPixCode ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                </div>

                {simulatorError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{simulatorError}</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={simulatingAction !== null}
                    onClick={() => void commitOrderToAdmin('paid_sim')}
                    className="da-btn-gold w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold disabled:opacity-60 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {simulatingAction === 'paid_sim'
                      ? 'Confirmando Pix e enviando para o Painel Admin...'
                      : 'Simular Pagamento Pix Aprovado'}
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={simulatingAction !== null}
                      onClick={() => void commitOrderToAdmin('pending')}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-[#781B68]/25 bg-white px-3 py-2 text-xs font-bold text-[#4A123F] hover:bg-[#FFF5EB] disabled:opacity-60 cursor-pointer"
                    >
                      {simulatingAction === 'pending'
                        ? 'Enviando...'
                        : 'Enviar como Pendente (Pagar depois)'}
                    </button>
                    <button
                      type="button"
                      disabled={simulatingAction !== null}
                      onClick={() => void commitOrderToAdmin('declined_sim')}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                    >
                      Simular Falha / Recusa
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* CARD SIMULATOR */}
            {paymentMethod === 'card' && (
              <div className="rounded-2xl border border-[#781B68]/20 bg-[#FAF7F4] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-sm font-bold text-[#310D2B]">
                    <Lock className="h-4 w-4 text-[#781B68]" />
                    Cartão de Crédito / Débito (Demo)
                  </div>
                  <button
                    type="button"
                    onClick={fillTestCard}
                    className="rounded-xl border border-[#781B68]/30 bg-white px-3 py-1.5 text-xs font-bold text-[#4A123F] hover:bg-[#781B68]/10 cursor-pointer"
                  >
                    Preencher cartão de teste
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'credit_1x', label: 'Crédito 1x' },
                      { id: 'credit_2x', label: 'Crédito 2x' },
                      { id: 'credit_3x', label: 'Crédito 3x' },
                      { id: 'debit', label: 'Débito' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCardMode(opt.id)}
                      className={`rounded-xl border py-2 px-2.5 text-xs font-bold cursor-pointer transition ${
                        cardMode === opt.id
                          ? 'border-[#781B68] bg-[#4A123F] text-white'
                          : 'border-neutral-200 bg-white text-[#3D2E35] hover:bg-neutral-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#1A1216]">Número do cartão (teste)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={22}
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4532 0199 8877 1234"
                      className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-mono-tabular text-sm focus:border-[#781B68] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#1A1216]">Nome impresso no cartão</label>
                    <input
                      type="text"
                      maxLength={60}
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="NOME DO TITULAR"
                      className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm uppercase focus:border-[#781B68] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1216]">Validade (MM/AA)</label>
                    <input
                      type="text"
                      maxLength={7}
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="12/29"
                      className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-mono-tabular text-sm focus:border-[#781B68] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1216]">CVV</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      placeholder="123"
                      className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-mono-tabular text-sm focus:border-[#781B68] focus:outline-none"
                    />
                  </div>
                </div>

                {simulatorError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{simulatorError}</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={simulatingAction !== null}
                    onClick={() => void commitOrderToAdmin('paid_sim')}
                    className="da-btn-gold w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold disabled:opacity-60 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {simulatingAction === 'paid_sim'
                      ? 'Aprovando cartão e enviando para o Painel Admin...'
                      : 'Simular Pagamento Aprovado'}
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={simulatingAction !== null}
                      onClick={() => void commitOrderToAdmin('pending')}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-[#781B68]/25 bg-white px-3 py-2 text-xs font-bold text-[#4A123F] hover:bg-[#FFF5EB] disabled:opacity-60 cursor-pointer"
                    >
                      Pagar na maquininha ({modality === 'pickup' ? 'retirada' : 'entrega'})
                    </button>
                    <button
                      type="button"
                      disabled={simulatingAction !== null}
                      onClick={() => void commitOrderToAdmin('declined_sim')}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                    >
                      Simular Cartão Recusado
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* CASH SIMULATOR */}
            {paymentMethod === 'cash' && (
              <div className="rounded-2xl border border-[#781B68]/20 bg-[#FAF7F4] p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#310D2B]">
                  <Banknote className="h-4 w-4 text-[#781B68]" />
                  Pagamento em Dinheiro ({modality === 'pickup' ? 'no balcão' : 'na entrega'})
                </div>
                <p className="text-xs text-[#43353C]">
                  Total do pedido: <strong>{formatBRL(preparedOrder?.total || 0)}</strong>
                  {changeFor.trim()
                    ? ` · Troco informado para R$ ${changeFor.trim()}`
                    : ' · Sem necessidade de troco'}
                </p>

                {simulatorError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{simulatorError}</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={simulatingAction !== null}
                    onClick={() => void commitOrderToAdmin('pending')}
                    className="da-btn-gold w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold disabled:opacity-60 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {simulatingAction === 'pending'
                      ? 'Enviando pedido para o Painel Admin...'
                      : 'Confirmar Pedido (Pagar na entrega/retirada)'}
                  </button>
                  <button
                    type="button"
                    disabled={simulatingAction !== null}
                    onClick={() => void commitOrderToAdmin('paid_sim')}
                    className="w-full min-h-[40px] inline-flex items-center justify-center rounded-xl border border-[#781B68]/25 bg-white px-3 py-2 text-xs font-bold text-[#4A123F] hover:bg-[#FFF5EB] disabled:opacity-60 cursor-pointer"
                  >
                    {simulatingAction === 'paid_sim'
                      ? 'Confirmando...'
                      : 'Simular Pagamento Já Recebido (Demo)'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={simulatingAction !== null}
              onClick={() => {
                setStep('form');
                setSimulatorError(null);
              }}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#781B68]/20 py-2.5 text-xs font-semibold text-[#4A123F] hover:bg-[#FFF5EB] cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar e editar dados do pedido
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

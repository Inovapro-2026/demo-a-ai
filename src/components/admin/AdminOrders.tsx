import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  CheckCircle2,
  MessageCircle,
  Printer,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import type { Order, OrderStatus } from '../../types/domain.ts';
import { writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import {
  formatBRL,
  formatDateTimeBR,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../lib/formatters.ts';

interface AdminOrdersProps {
  orders: Order[];
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const STATUS_TABS: Array<{ id: OrderStatus | 'all'; label: string }> = [
  { id: 'received', label: 'Novos' },
  { id: 'confirmed', label: 'Confirmados' },
  { id: 'preparing', label: 'Em preparação' },
  { id: 'ready', label: 'Prontos' },
  { id: 'out_for_delivery', label: 'Em entrega' },
  { id: 'completed', label: 'Concluídos' },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'all', label: 'Todos' },
];

export const AdminOrders: React.FC<AdminOrdersProps> = ({
  orders,
  soundEnabled,
  onToggleSound,
}) => {
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('received');
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter((o) => o.status === activeTab);
  }, [orders, activeTab]);

  const countByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => {
      map[o.status] = (map[o.status] || 0) + 1;
    });
    return map;
  }, [orders]);

  const updateOrderState = async (
    order: Order,
    nextStatus: OrderStatus,
    nextPaymentStatus?: Order['paymentStatus'],
    reason?: string
  ) => {
    setBusyOrderId(order.id);
    try {
      const batch = writeBatch(db);
      const paymentStatusToSave = nextPaymentStatus || order.paymentStatus;

      batch.update(doc(db, 'orders', order.id), {
        status: nextStatus,
        paymentStatus: paymentStatusToSave,
        cancelReason: reason !== undefined ? reason : order.cancelReason || '',
        updatedAt: serverTimestamp(),
      });

      if (order.trackingId) {
        batch.update(doc(db, 'orderTracking', order.trackingId), {
          status: nextStatus,
          paymentStatus: paymentStatusToSave,
          cancelReason: reason !== undefined ? reason : order.cancelReason || '',
          updatedAt: serverTimestamp(),
        });
      }

      if (nextPaymentStatus === 'paid' && order.paymentStatus !== 'paid') {
        const feeRate = order.paymentMethod === 'card' ? 0.032 : order.paymentMethod === 'pix' ? 0.005 : 0;
        const feeAmount = Number((order.total * feeRate).toFixed(2));
        const netAmount = Number((order.total - feeAmount).toFixed(2));
        batch.set(doc(db, 'payments', `pay_${order.id}`), {
          orderId: order.id,
          orderNumber: order.orderNumber,
          method: order.paymentMethod,
          amount: order.total,
          feeAmount,
          netAmount,
          status: 'confirmed',
          providerRef: order.paymentMethod === 'pix' ? 'Validado manualmente pelo admin' : 'Recebido na entrega/balcão',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      await writeAuditLog(
        `order_status_${nextStatus}`,
        'order',
        order.id,
        `Pedido ${order.orderNumber} alterado para ${ORDER_STATUS_LABELS[nextStatus]}${reason ? ` (${reason})` : ''}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingOrder || cancelReason.trim().length < 3) return;
    await updateOrderState(cancellingOrder, 'cancelled', cancellingOrder.paymentStatus, cancelReason.trim());
    setCancellingOrder(null);
    setCancelReason('');
  };

  const getNextStep = (order: Order): { status: OrderStatus; label: string } | null => {
    if (order.status === 'received') return { status: 'confirmed', label: 'Confirmar pedido' };
    if (order.status === 'confirmed') return { status: 'preparing', label: 'Iniciar preparo' };
    if (order.status === 'preparing') {
      return order.modality === 'pickup'
        ? { status: 'ready', label: 'Pronto p/ retirada' }
        : { status: 'out_for_delivery', label: 'Saiu p/ entrega' };
    }
    if (order.status === 'ready' || order.status === 'out_for_delivery') {
      return { status: 'completed', label: 'Concluir pedido' };
    }
    return null;
  };

  const handlePrint = (order: Order) => {
    setPrintingOrder(order);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Central de Pedidos</h1>
          <p className="text-sm text-[#5C4952]">
            Acompanhamento em tempo real dos pedidos recebidos pela loja online.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleSound}
          className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-bold cursor-pointer ${
            soundEnabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-[#781B68]/20 bg-white text-[#5C4952]'
          }`}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {soundEnabled ? 'Alerta sonoro ativado' : 'Alerta sonoro silenciado'}
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-print">
        {STATUS_TABS.map((tab) => {
          const count = tab.id === 'all' ? orders.length : countByStatus[tab.id] || 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition ${
                activeTab === tab.id
                  ? 'da-btn-3d text-white'
                  : 'border border-[#781B68]/15 bg-white text-[#3D2E35] hover:bg-[#FFF5EB]'
              }`}
            >
              <span>{tab.label}</span>
              <span className="font-mono-tabular opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      <div className="space-y-4 no-print">
        {filtered.length === 0 ? (
          <div className="da-admin-card rounded-3xl p-10 text-center text-sm text-[#5C4952]">
            Nenhum pedido na fila “{STATUS_TABS.find((t) => t.id === activeTab)?.label}”.
          </div>
        ) : (
          filtered.map((order) => {
            const nextStep = getNextStep(order);
            const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
            const waLink = cleanPhone
              ? `https://wa.me/${cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone}?text=${encodeURIComponent(
                  `Olá ${order.customerName}! Sobre o seu pedido ${order.orderNumber} na Dois Amores:`
                )}`
              : '#';

            return (
              <div
                key={order.id}
                className="da-admin-card rounded-3xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C4952]">
                      <span className="font-mono-tabular font-bold text-[#4A123F]">
                        {order.orderNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDateTimeBR(order.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{order.modality === 'pickup' ? 'Retirada' : 'Entrega'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#1A1216]">
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-[#1A1216]">
                      {order.customerName} · <span className="font-mono-tabular">{order.customerPhone}</span>
                    </h3>
                    {order.modality === 'delivery' && (
                      <p className="mt-0.5 text-xs text-[#43353C]">
                        {order.address}, {order.number} {order.complement ? `(${order.complement})` : ''} — {order.neighborhood}
                        {order.cep ? ` · CEP ${order.cep}` : ''}
                        {order.reference ? ` · Ref.: ${order.reference}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="font-mono-tabular text-lg font-bold text-[#4A1230]">
                      {formatBRL(order.total)}
                    </div>
                    <div className="text-xs text-[#5C4952]">
                      {PAYMENT_METHOD_LABELS[order.paymentMethod]} ·{' '}
                      <span
                        className={
                          order.paymentStatus === 'paid'
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-amber-700'
                        }
                      >
                        {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2 text-sm">
                  {(order.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between gap-4">
                      <div>
                        <span className="font-mono-tabular font-semibold">{item.quantity}x</span>{' '}
                        <span className="font-semibold text-[#1A1216]">{item.productName}</span>{' '}
                        <span className="text-xs text-[#5C4952]">
                          ({item.sizeName} · {item.baseName})
                        </span>
                        {item.addons && item.addons.length > 0 && (
                          <div className="text-xs text-[#43353C] ml-5">
                            + {item.addons.map((a) => `${a.qty}x ${a.name}`).join(', ')}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-xs italic text-[#5C4952] ml-5">Obs.: {item.notes}</div>
                        )}
                      </div>
                      <span className="font-mono-tabular text-xs font-semibold text-[#1A1216] shrink-0">
                        {formatBRL(item.lineTotal)}
                      </span>
                    </div>
                  ))}
                  {order.notes && (
                    <div className="rounded-lg bg-[#FAF7F4] px-3 py-2 text-xs text-[#3D2E35]">
                      <strong>Observação do pedido:</strong> {order.notes}
                    </div>
                  )}
                  {order.cancelReason && (
                    <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                      <strong>Cancelado:</strong> {order.cancelReason}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {nextStep && (
                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateOrderState(order, nextStep.status)}
                        className="da-btn-3d inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {nextStep.label}
                      </button>
                    )}

                    {order.status !== 'cancelled' && order.paymentStatus !== 'paid' && (
                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateOrderState(order, order.status, 'paid')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        Confirmar pagamento
                      </button>
                    )}

                    {order.status !== 'cancelled' && order.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => setCancellingOrder(order)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {cleanPhone && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePrint(order)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-[#1A1216] hover:bg-neutral-50 cursor-pointer"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimir
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Cancel justification modal */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-bold text-[#1A1216]">
              Cancelar Pedido {cancellingOrder.orderNumber}
            </h3>
            <p className="text-xs text-[#5C4952]">
              Informe a justificativa do cancelamento (o histórico do pedido será preservado).
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex.: Cliente solicitou cancelamento / endereço fora da área..."
              className="w-full rounded-xl border border-neutral-300 p-3 text-sm focus:border-[#4A1230] focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingOrder(null);
                  setCancelReason('');
                }}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-[#1A1216] cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={cancelReason.trim().length < 3}
                onClick={() => void handleConfirmCancel()}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt View */}
      {printingOrder && (
        <div className="hidden print-only p-6 font-mono text-xs text-black max-w-sm mx-auto">
          <div className="text-center border-b border-dashed border-black pb-3 mb-3">
            <div className="text-base font-bold">DOIS AMORES AÇAÍTERIA</div>
            <div>Pedido {printingOrder.orderNumber}</div>
            <div>{formatDateTimeBR(printingOrder.createdAt)}</div>
          </div>
          <div className="mb-3">
            <div><strong>Cliente:</strong> {printingOrder.customerName}</div>
            <div><strong>Fone:</strong> {printingOrder.customerPhone}</div>
            <div><strong>Modalidade:</strong> {printingOrder.modality === 'pickup' ? 'Retirada' : 'Entrega'}</div>
            {printingOrder.modality === 'delivery' && (
              <div>
                <strong>Endereço:</strong> {printingOrder.address}, {printingOrder.number} - {printingOrder.neighborhood}
              </div>
            )}
          </div>
          <div className="border-t border-b border-dashed border-black py-2 my-2 space-y-1">
            {printingOrder.items.map((it, idx) => (
              <div key={idx}>
                <div className="flex justify-between">
                  <span>{it.quantity}x {it.productName} ({it.sizeName})</span>
                  <span>{formatBRL(it.lineTotal)}</span>
                </div>
                {it.addons.length > 0 && (
                  <div className="pl-3">+ {it.addons.map((a) => `${a.qty}x ${a.name}`).join(', ')}</div>
                )}
                {it.notes && <div className="pl-3">Obs: {it.notes}</div>}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>Subtotal:</span><span>{formatBRL(printingOrder.subtotal)}</span></div>
            <div className="flex justify-between"><span>Desconto:</span><span>-{formatBRL(printingOrder.discount)}</span></div>
            <div className="flex justify-between"><span>Entrega:</span><span>{formatBRL(printingOrder.deliveryFee)}</span></div>
            <div className="flex justify-between font-bold text-sm"><span>TOTAL:</span><span>{formatBRL(printingOrder.total)}</span></div>
            <div>Pagamento: {PAYMENT_METHOD_LABELS[printingOrder.paymentMethod]} ({PAYMENT_STATUS_LABELS[printingOrder.paymentStatus]})</div>
          </div>
        </div>
      )}
    </div>
  );
};

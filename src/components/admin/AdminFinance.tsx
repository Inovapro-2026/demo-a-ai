import React, { useMemo, useState } from 'react';
import type { Expense, Order, PaymentRecord } from '../../types/domain.ts';
import { formatBRL, toDate } from '../../lib/formatters.ts';

interface AdminFinanceProps {
  orders: Order[];
  payments: PaymentRecord[];
  expenses: Expense[];
}

export const AdminFinance: React.FC<AdminFinanceProps> = ({ orders, payments, expenses }) => {
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'all'>('30d');

  const cutoff = useMemo(() => {
    const now = new Date();
    if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (period === '7d') return Date.now() - 7 * 86400000;
    if (period === '30d') return Date.now() - 30 * 86400000;
    return 0;
  }, [period]);

  const validOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (o.status === 'cancelled') return false;
        const d = toDate(o.createdAt);
        return d ? d.getTime() >= cutoff : period === 'all';
      }),
    [orders, cutoff, period]
  );

  const periodPayments = useMemo(
    () =>
      payments.filter((p) => {
        if (p.status !== 'confirmed') return false;
        const d = toDate(p.createdAt);
        return d ? d.getTime() >= cutoff : period === 'all';
      }),
    [payments, cutoff, period]
  );

  const periodExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = toDate(e.date);
        return d ? d.getTime() >= cutoff : period === 'all';
      }),
    [expenses, cutoff, period]
  );

  const summary = useMemo(() => {
    const grossOrdersTotal = validOrders.reduce((acc, o) => acc + (o.total || 0), 0);
    const receivedGross = periodPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const paymentFees = periodPayments.reduce((acc, p) => acc + (p.feeAmount || 0), 0);
    const netReceived = receivedGross - paymentFees;

    const pixSales = validOrders
      .filter((o) => o.paymentMethod === 'pix')
      .reduce((acc, o) => acc + (o.total || 0), 0);
    const cashSales = validOrders
      .filter((o) => o.paymentMethod === 'cash')
      .reduce((acc, o) => acc + (o.total || 0), 0);
    const cardSales = validOrders
      .filter((o) => o.paymentMethod === 'card')
      .reduce((acc, o) => acc + (o.total || 0), 0);

    const paidExpenses = periodExpenses
      .filter((e) => e.status === 'paid')
      .reduce((acc, e) => acc + (e.amount || 0), 0);
    const accountsPayable = expenses
      .filter((e) => e.status === 'pending')
      .reduce((acc, e) => acc + (e.amount || 0), 0);
    const accountsReceivable = validOrders
      .filter((o) => o.paymentStatus === 'pending')
      .reduce((acc, o) => acc + (o.total || 0), 0);

    const totalExpenses = periodExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const estimatedProfit = grossOrdersTotal - paymentFees - totalExpenses;

    return {
      grossOrdersTotal,
      receivedGross,
      paymentFees,
      netReceived,
      pixSales,
      cashSales,
      cardSales,
      paidExpenses,
      totalExpenses,
      accountsPayable,
      accountsReceivable,
      estimatedProfit,
    };
  }, [validOrders, periodPayments, periodExpenses, expenses]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Gestão Financeira</h1>
          <p className="text-sm text-[#5C4952]">
            Separação transparente entre pedidos emitidos, pagamentos efetivamente recebidos, taxas e despesas (pedidos cancelados são excluídos).
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-2xl border border-[#781B68]/15 bg-white p-1 shadow-xs">
          {(
            [
              { id: 'today', label: 'Hoje' },
              { id: '7d', label: '7 dias' },
              { id: '30d', label: '30 dias' },
              { id: 'all', label: 'Tudo' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition ${
                period === p.id ? 'da-btn-3d text-white' : 'text-[#5C4952] hover:text-[#310D2B]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Faturamento bruto (pedidos)', value: formatBRL(summary.grossOrdersTotal) },
          { label: 'Pagamentos recebidos (líquido)', value: formatBRL(summary.netReceived) },
          { label: 'Taxas de pagamento', value: formatBRL(summary.paymentFees) },
          { label: 'Despesas do período', value: formatBRL(summary.totalExpenses) },
          { label: 'Vendas via Pix', value: formatBRL(summary.pixSales) },
          { label: 'Vendas em Dinheiro', value: formatBRL(summary.cashSales) },
          { label: 'Vendas no Cartão', value: formatBRL(summary.cardSales) },
          {
            label: 'Lucro líquido estimado',
            value: formatBRL(summary.estimatedProfit),
            highlight: summary.estimatedProfit >= 0 ? 'text-emerald-700' : 'text-red-700',
          },
          { label: 'Contas a receber (pendentes)', value: formatBRL(summary.accountsReceivable) },
          { label: 'Contas a pagar (em aberto)', value: formatBRL(summary.accountsPayable) },
        ].map((card) => (
          <div key={card.label} className="da-admin-card rounded-3xl p-5">
            <div className="text-xs font-semibold text-[#5C4952]">{card.label}</div>
            <div
              className={`mt-2 font-mono-tabular text-xl font-extrabold ${
                card.highlight || 'text-[#310D2B]'
              }`}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

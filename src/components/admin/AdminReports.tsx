import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { Expense, Order, PaymentRecord } from '../../types/domain.ts';
import {
  exportToCSV,
  formatBRL,
  formatDateTimeBR,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../lib/formatters.ts';

interface AdminReportsProps {
  orders: Order[];
  expenses: Expense[];
  payments: PaymentRecord[];
}

type ReportKind = 'sales' | 'orders' | 'products' | 'customers' | 'expenses' | 'profit' | 'payments';

export const AdminReports: React.FC<AdminReportsProps> = ({ orders, expenses, payments }) => {
  const [reportKind, setReportKind] = useState<ReportKind>('sales');

  const reportData = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== 'cancelled');

    if (reportKind === 'sales' || reportKind === 'orders') {
      const list = reportKind === 'sales' ? validOrders : orders;
      return {
        title: reportKind === 'sales' ? 'Relatório de Vendas' : 'Relatório Geral de Pedidos',
        headers: ['Pedido', 'Data', 'Cliente', 'Modalidade', 'Pagamento', 'Status', 'Total (R$)'],
        rows: list.map((o) => [
          o.orderNumber,
          formatDateTimeBR(o.createdAt),
          o.customerName,
          o.modality === 'pickup' ? 'Retirada' : 'Entrega',
          PAYMENT_METHOD_LABELS[o.paymentMethod] || o.paymentMethod,
          ORDER_STATUS_LABELS[o.status] || o.status,
          o.total.toFixed(2).replace('.', ','),
        ]),
      };
    }

    if (reportKind === 'products') {
      const map = new Map<string, { name: string; qty: number; rev: number }>();
      validOrders.forEach((o) =>
        o.items.forEach((it) => {
          const cur = map.get(it.productId) || { name: it.productName, qty: 0, rev: 0 };
          cur.qty += it.quantity;
          cur.rev += it.lineTotal;
          map.set(it.productId, cur);
        })
      );
      return {
        title: 'Relatório de Desempenho de Produtos',
        headers: ['Produto', 'Unidades Vendidas', 'Receita Total (R$)'],
        rows: Array.from(map.values())
          .sort((a, b) => b.rev - a.rev)
          .map((p) => [p.name, p.qty, p.rev.toFixed(2).replace('.', ',')]),
      };
    }

    if (reportKind === 'customers') {
      const map = new Map<string, { name: string; phone: string; count: number; total: number }>();
      validOrders.forEach((o) => {
        const key = o.customerPhone || o.customerName;
        const cur = map.get(key) || { name: o.customerName, phone: o.customerPhone, count: 0, total: 0 };
        cur.count += 1;
        cur.total += o.total;
        map.set(key, cur);
      });
      return {
        title: 'Relatório de Clientes',
        headers: ['Cliente', 'Telefone', 'Qtd. Compras', 'Total Gasto (R$)'],
        rows: Array.from(map.values()).map((c) => [
          c.name,
          c.phone,
          c.count,
          c.total.toFixed(2).replace('.', ','),
        ]),
      };
    }

    if (reportKind === 'expenses') {
      return {
        title: 'Relatório de Despesas',
        headers: ['Data', 'Descrição', 'Categoria', 'Pagamento', 'Status', 'Valor (R$)'],
        rows: expenses.map((e) => [
          e.date,
          e.description,
          e.category,
          e.paymentMethod.toUpperCase(),
          e.status === 'paid' ? 'Pago' : 'Em aberto',
          e.amount.toFixed(2).replace('.', ','),
        ]),
      };
    }

    if (reportKind === 'payments') {
      return {
        title: 'Relatório por Forma de Pagamento',
        headers: ['Pedido', 'Método', 'Valor Bruto (R$)', 'Taxa (R$)', 'Valor Líquido (R$)', 'Status'],
        rows: payments.map((p) => [
          p.orderNumber,
          PAYMENT_METHOD_LABELS[p.method] || p.method,
          p.amount.toFixed(2).replace('.', ','),
          p.feeAmount.toFixed(2).replace('.', ','),
          p.netAmount.toFixed(2).replace('.', ','),
          p.status,
        ]),
      };
    }

    // Profit
    const gross = validOrders.reduce((acc, o) => acc + o.total, 0);
    const fees = payments.reduce((acc, p) => acc + p.feeAmount, 0);
    const expTotal = expenses.reduce((acc, e) => acc + e.amount, 0);
    const profit = gross - fees - expTotal;
    return {
      title: 'Relatório Consolidado de Lucratividade',
      headers: ['Indicador', 'Valor (R$)'],
      rows: [
        ['Faturamento Bruto (Pedidos válidos)', formatBRL(gross)],
        ['Taxas de Pagamento', formatBRL(fees)],
        ['Despesas Registradas', formatBRL(expTotal)],
        ['Lucro Líquido Estimado', formatBRL(profit)],
      ],
    };
  }, [reportKind, orders, expenses, payments]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Relatórios e Exportação</h1>
          <p className="text-sm text-[#5C4952]">
            Exporte dados operacionais e financeiros reais em CSV (Excel) ou PDF para impressão.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportToCSV(
                `dois-amores-${reportKind}.csv`,
                reportData.headers,
                reportData.rows
              )
            }
            className="inline-flex items-center gap-2 rounded-2xl border border-[#781B68]/20 bg-white px-4 py-2 text-xs font-bold text-[#310D2B] hover:bg-[#FFF5EB] cursor-pointer"
          >
            <Download className="h-4 w-4 text-[#781B68]" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="da-btn-3d inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 no-print">
        {(
          [
            { id: 'sales', label: 'Vendas' },
            { id: 'orders', label: 'Pedidos' },
            { id: 'products', label: 'Produtos' },
            { id: 'customers', label: 'Clientes' },
            { id: 'expenses', label: 'Despesas' },
            { id: 'profit', label: 'Lucros' },
            { id: 'payments', label: 'Formas de Pagamento' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setReportKind(tab.id)}
            className={`rounded-2xl px-3.5 py-2 text-xs font-bold cursor-pointer transition ${
              reportKind === tab.id
                ? 'da-btn-3d text-white'
                : 'border border-[#781B68]/15 bg-white text-[#3D2E35] hover:bg-[#FFF5EB]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="da-admin-card rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#781B68]/10 pb-3">
          <h2 className="font-display text-lg font-bold text-[#310D2B]">{reportData.title}</h2>
          <span className="font-mono-tabular text-xs font-semibold text-[#781B68]">
            {reportData.rows.length} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#781B68]/12 bg-[#FFF5EB] text-xs font-bold text-[#4A123F]">
              <tr>
                {reportData.headers.map((h) => (
                  <th key={h} className="px-3.5 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {reportData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={reportData.headers.length}
                    className="px-3.5 py-8 text-center text-sm text-[#5C4952]"
                  >
                    Sem dados para este relatório no momento.
                  </td>
                </tr>
              ) : (
                reportData.rows.map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3.5 py-2.5 text-xs text-[#1A1216] font-mono-tabular">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

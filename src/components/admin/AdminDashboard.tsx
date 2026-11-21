import React, { useMemo, useState } from 'react';
import type { Order, PaymentRecord, Product } from '../../types/domain.ts';
import { formatBRL, PAYMENT_METHOD_LABELS, toDate } from '../../lib/formatters.ts';

interface AdminDashboardProps {
  orders: Order[];
  payments: PaymentRecord[];
  products: Product[];
}

type PeriodFilter = 'today' | '7d' | '30d' | 'all';
type ChartGranularity = 'day' | 'week' | 'month';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ orders, products }) => {
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [granularity, setGranularity] = useState<ChartGranularity>('day');

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const nonCancelledOrders = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled'),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const cutoff = (() => {
      if (period === 'today') return startOfToday.getTime();
      if (period === '7d') return Date.now() - 7 * 86400000;
      if (period === '30d') return Date.now() - 30 * 86400000;
      return 0;
    })();
    return orders.filter((o) => {
      const d = toDate(o.createdAt);
      return d ? d.getTime() >= cutoff : period === 'all';
    });
  }, [orders, period, startOfToday]);

  const metrics = useMemo(() => {
    const todayRev = nonCancelledOrders
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d && d.getTime() >= startOfToday.getTime();
      })
      .reduce((acc, o) => acc + (o.total || 0), 0);

    const monthRev = nonCancelledOrders
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d && d.getTime() >= startOfMonth.getTime();
      })
      .reduce((acc, o) => acc + (o.total || 0), 0);

    const validFiltered = filteredOrders.filter((o) => o.status !== 'cancelled');
    const periodRevenue = validFiltered.reduce((acc, o) => acc + (o.total || 0), 0);
    const avgTicket = validFiltered.length > 0 ? periodRevenue / validFiltered.length : 0;

    const pendingCount = orders.filter((o) => o.status === 'received' || o.status === 'confirmed').length;
    const preparingCount = orders.filter((o) => o.status === 'preparing').length;
    const completedCount = filteredOrders.filter((o) => o.status === 'completed').length;

    const uniqueCustomers = new Set(
      orders.map((o) => (o.customerPhone || o.customerName || '').replace(/\D/g, '') || o.customerName)
    ).size;

    return {
      todayRev,
      monthRev,
      totalOrders: filteredOrders.length,
      pendingCount,
      preparingCount,
      completedCount,
      avgTicket,
      uniqueCustomers,
    };
  }, [orders, nonCancelledOrders, filteredOrders, startOfToday, startOfMonth]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        (o.items || []).forEach((item) => {
          const prev = map.get(item.productId) || { name: item.productName, qty: 0, revenue: 0 };
          prev.qty += item.quantity;
          prev.revenue += item.lineTotal;
          map.set(item.productId, prev);
        });
      });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [filteredOrders]);

  const paymentDistribution = useMemo(() => {
    const counts: Record<string, { count: number; total: number }> = {
      pix: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      cash: { count: 0, total: 0 },
    };
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        if (!counts[o.paymentMethod]) counts[o.paymentMethod] = { count: 0, total: 0 };
        counts[o.paymentMethod].count += 1;
        counts[o.paymentMethod].total += o.total || 0;
      });
    const grandTotal = Object.values(counts).reduce((a, b) => a + b.total, 0) || 1;
    return Object.entries(counts).map(([method, val]) => ({
      method,
      label: PAYMENT_METHOD_LABELS[method] || method,
      count: val.count,
      total: val.total,
      pct: Math.round((val.total / grandTotal) * 100),
    }));
  }, [filteredOrders]);

  const timeSeries = useMemo(() => {
    const bucketMap = new Map<string, number>();
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        const d = toDate(o.createdAt);
        if (!d) return;
        let key = '';
        if (granularity === 'day') {
          key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else if (granularity === 'week') {
          const firstDay = new Date(d);
          firstDay.setDate(d.getDate() - d.getDay());
          key = `Sem ${String(firstDay.getDate()).padStart(2, '0')}/${String(firstDay.getMonth() + 1).padStart(2, '0')}`;
        } else {
          key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
        bucketMap.set(key, (bucketMap.get(key) || 0) + (o.total || 0));
      });
    return Array.from(bucketMap.entries()).slice(-12);
  }, [filteredOrders, granularity]);

  const maxChartVal = Math.max(1, ...timeSeries.map(([, v]) => v));
  const maxProductRev = Math.max(1, ...topProducts.map((p) => p.revenue));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Visão Geral do Negócio</h1>
          <p className="text-sm text-[#5C4952]">
            Indicadores calculados em tempo real a partir dos pedidos reais registrados no banco de dados.
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
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                period === p.id ? 'da-btn-3d text-white' : 'text-[#5C4952] hover:text-[#310D2B]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Faturamento de hoje', value: formatBRL(metrics.todayRev), sub: 'Pedidos válidos' },
          { label: 'Faturamento do mês', value: formatBRL(metrics.monthRev), sub: 'Acumulado mensal' },
          { label: 'Total de pedidos', value: String(metrics.totalOrders), sub: `${metrics.completedCount} concluídos` },
          { label: 'Ticket médio', value: formatBRL(metrics.avgTicket), sub: 'No período selecionado' },
          { label: 'Pedidos pendentes', value: String(metrics.pendingCount), sub: 'Novos e confirmados' },
          { label: 'Em preparação', value: String(metrics.preparingCount), sub: 'Na cozinha agora' },
          { label: 'Total de clientes', value: String(metrics.uniqueCustomers), sub: 'Contatos únicos' },
          { label: 'Produtos ativos', value: String(products.filter((p) => !p.archived && p.available).length), sub: `De ${products.filter((p) => !p.archived).length} cadastrados` },
        ].map((kpi) => (
          <div key={kpi.label} className="da-admin-card rounded-3xl p-5">
            <div className="text-xs font-semibold text-[#5C4952]">{kpi.label}</div>
            <div className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#310D2B]">
              {kpi.value}
            </div>
            <div className="mt-1 text-xs font-medium text-[#781B68]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Revenue Bar Chart */}
        <div className="da-admin-card lg:col-span-7 rounded-3xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-[#310D2B]">Evolução das Vendas</h2>
            <div className="flex items-center gap-1 rounded-xl bg-[#FFF5EB] p-1 border border-[#781B68]/10">
              {(
                [
                  { id: 'day', label: 'Por dia' },
                  { id: 'week', label: 'Por semana' },
                  { id: 'month', label: 'Por mês' },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGranularity(g.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer transition ${
                    granularity === g.id ? 'bg-white text-[#4A123F] shadow-xs' : 'text-[#5C4952]'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {timeSeries.length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-[#781B68]/20 bg-[#FFF5EB]/40 text-sm text-[#5C4952]">
              Sem vendas registradas neste período ainda.
            </div>
          ) : (
            <div className="h-56 flex items-end gap-2.5 pt-6 pb-2 border-b border-[#781B68]/15 overflow-x-auto">
              {timeSeries.map(([label, val]) => {
                const heightPct = Math.max(8, Math.round((val / maxChartVal) * 100));
                return (
                  <div key={label} className="group flex flex-1 min-w-[46px] flex-col items-center gap-2 h-full justify-end">
                    <span className="font-mono-tabular text-[10px] font-bold text-[#4A123F]">
                      {formatBRL(val)}
                    </span>
                    <div
                      className="w-full max-w-[38px] rounded-t-xl transition-transform duration-200 group-hover:scale-y-105 origin-bottom shadow-[0_4px_12px_-4px_rgba(120,27,104,0.45)]"
                      style={{
                        height: `${heightPct}%`,
                        background: 'linear-gradient(180deg, #781B68 0%, #4A123F 100%)',
                      }}
                      title={`${label}: ${formatBRL(val)}`}
                    />
                    <span className="font-mono-tabular text-[11px] text-[#5C4952] truncate max-w-full">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Distribution */}
        <div className="da-admin-card lg:col-span-5 rounded-3xl p-5 space-y-4">
          <h2 className="font-display text-lg font-bold text-[#310D2B]">Distribuição dos Pagamentos</h2>
          <div className="space-y-4">
            {paymentDistribution.map((row) => (
              <div key={row.method} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-[#1A1216]">
                    {row.label} ({row.count})
                  </span>
                  <span className="font-mono-tabular text-xs font-bold text-[#4A123F]">
                    {formatBRL(row.total)} · {row.pct}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#FFF5EB]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#4A123F] to-[#781B68]"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Selling Products */}
      <div className="da-admin-card rounded-3xl p-5 space-y-4">
        <h2 className="font-display text-lg font-bold text-[#310D2B]">Produtos Mais Vendidos</h2>
        {topProducts.length === 0 ? (
          <p className="text-sm text-[#5C4952]">Nenhum item vendido no período selecionado.</p>
        ) : (
          <div className="space-y-3">
            {topProducts.map((prod) => (
              <div key={prod.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-[#1A1216]">{prod.name}</span>
                  <span className="font-mono-tabular text-xs text-[#4A123F] font-bold">
                    {prod.qty} un · {formatBRL(prod.revenue)}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#FFF5EB] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#E6AE52] to-[#D3922A]"
                    style={{ width: `${Math.round((prod.revenue / maxProductRev) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

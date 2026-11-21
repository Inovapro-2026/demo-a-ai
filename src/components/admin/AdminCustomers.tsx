import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Order } from '../../types/domain.ts';
import { formatBRL, formatDateTimeBR, ORDER_STATUS_LABELS, toDate } from '../../lib/formatters.ts';

interface AdminCustomersProps {
  orders: Order[];
}

interface CustomerAggregate {
  key: string;
  name: string;
  phone: string;
  lastAddress: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderDate: Date | null;
  orders: Order[];
}

export const AdminCustomers: React.FC<AdminCustomersProps> = ({ orders }) => {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAggregate | null>(null);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerAggregate>();
    for (const order of orders) {
      const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
      const key = cleanPhone || order.customerName.trim().toLowerCase();
      const existing = map.get(key);
      const orderDate = toDate(order.createdAt);
      const validSpent = order.status !== 'cancelled' ? order.total || 0 : 0;
      const addr =
        order.modality === 'delivery'
          ? `${order.address || ''}, ${order.number || ''} — ${order.neighborhood || ''}`
          : 'Retirada no balcão';

      if (!existing) {
        map.set(key, {
          key,
          name: order.customerName,
          phone: order.customerPhone,
          lastAddress: addr,
          ordersCount: 1,
          totalSpent: validSpent,
          lastOrderDate: orderDate,
          orders: [order],
        });
      } else {
        existing.ordersCount += 1;
        existing.totalSpent += validSpent;
        existing.orders.push(order);
        if (orderDate && (!existing.lastOrderDate || orderDate > existing.lastOrderDate)) {
          existing.lastOrderDate = orderDate;
          existing.lastAddress = addr;
          existing.name = order.customerName;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.lastAddress.toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Gestão de Clientes</h1>
          <p className="text-sm text-[#5C4952]">
            Histórico consolidado de compras e endereços dos clientes.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#781B68]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente ou telefone..."
            className="w-full rounded-xl border border-[#781B68]/20 bg-white pl-9 pr-3 py-2 text-sm focus:border-[#781B68] focus:outline-none"
          />
        </div>
      </div>

      <div className="da-admin-card overflow-x-auto rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#781B68]/10 bg-[#FFF5EB] text-xs font-bold text-[#310D2B]">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Último endereço</th>
              <th className="px-4 py-3 text-right">Compras</th>
              <th className="px-4 py-3 text-right">Total gasto</th>
              <th className="px-4 py-3">Último pedido</th>
              <th className="px-4 py-3 text-right">Histórico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#5C4952]">
                  Nenhum cliente encontrado ainda.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.key} className="hover:bg-[#FFF5EB]/50">
                  <td className="px-4 py-3 font-semibold text-[#310D2B]">{c.name}</td>
                  <td className="px-4 py-3 font-mono-tabular text-xs">{c.phone}</td>
                  <td className="px-4 py-3 text-xs text-[#43353C] max-w-xs truncate">
                    {c.lastAddress}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                    {c.ordersCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#781B68]">
                    {formatBRL(c.totalSpent)}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#5C4952]">
                    {formatDateTimeBR(c.lastOrderDate)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(c)}
                      className="rounded-lg border border-[#781B68]/20 px-3 py-1 text-xs font-semibold text-[#781B68] hover:bg-[#FFF5EB] cursor-pointer"
                    >
                      Ver pedidos
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#310D2B]/65 backdrop-blur-sm p-4">
          <div className="max-h-[85vh] w-full max-w-xl flex flex-col overflow-hidden rounded-3xl border border-[#781B68]/20 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#781B68]/10 bg-[#FFF5EB] px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#310D2B]">
                  {selectedCustomer.name}
                </h2>
                <p className="text-xs text-[#5C4952]">{selectedCustomer.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg p-1.5 text-[#310D2B] hover:bg-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {selectedCustomer.orders.map((ord) => (
                <div key={ord.id} className="da-admin-card rounded-xl p-3.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold">
                    <span className="font-mono-tabular text-[#781B68]">{ord.orderNumber}</span>
                    <span>{ORDER_STATUS_LABELS[ord.status]}</span>
                  </div>
                  <div className="text-[#5C4952]">{formatDateTimeBR(ord.createdAt)}</div>
                  <div>
                    {ord.items.map((it) => `${it.quantity}x ${it.productName}`).join(', ')}
                  </div>
                  <div className="font-mono-tabular font-bold text-[#310D2B]">
                    Total: {formatBRL(ord.total)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

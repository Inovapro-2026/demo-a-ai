import React, { useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import type { Coupon } from '../../types/domain.ts';
import { writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL } from '../../lib/formatters.ts';

interface AdminCouponsProps {
  coupons: Coupon[];
}

export const AdminCoupons: React.FC<AdminCouponsProps> = ({ coupons }) => {
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('10');
  const [minOrderValue, setMinOrderValue] = useState('30');
  const [maxUses, setMaxUses] = useState('100');
  const [expiresAt, setExpiresAt] = useState('2027-12-31');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (cleanCode.length < 2) return;

    try {
      await setDoc(doc(db, 'coupons', cleanCode), {
        code: cleanCode,
        type,
        value: Math.max(1, Number(value) || 10),
        minOrderValue: Math.max(0, Number(minOrderValue) || 0),
        firstOrderOnly,
        maxUses: Math.max(1, Number(maxUses) || 50),
        usedCount: 0,
        expiresAt: expiresAt || '',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('coupon_created', 'coupon', cleanCode, `Cupom criado: ${cleanCode}`);
      setCode('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `coupons/${cleanCode}`);
    }
  };

  const toggleActive = async (c: Coupon) => {
    try {
      await updateDoc(doc(db, 'coupons', c.code), {
        active: !c.active,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `coupons/${c.code}`);
    }
  };

  const handleDelete = async (c: Coupon) => {
    try {
      await deleteDoc(doc(db, 'coupons', c.code));
      await writeAuditLog('coupon_deleted', 'coupon', c.code, `Cupom removido: ${c.code}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `coupons/${c.code}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#310D2B]">Cupons e Promoções</h1>
        <p className="text-sm text-[#5C4952]">
          Crie cupons percentuais ou de valor fixo com pedido mínimo, validade e limite de uso.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="da-admin-card grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-2xl p-4"
      >
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código (ex.: ACAI15)"
          className="sm:col-span-3 rounded-xl border border-neutral-300 px-3 py-2 text-sm uppercase font-mono-tabular"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
          className="sm:col-span-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor fixo (R$)</option>
        </select>
        <input
          type="number"
          step="0.5"
          min="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Valor"
          className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
        />
        <input
          type="number"
          step="1"
          min="0"
          value={minOrderValue}
          onChange={(e) => setMinOrderValue(e.target.value)}
          placeholder="Mínimo R$"
          className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
        />
        <input
          type="number"
          min="1"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="Limite usos"
          className="sm:col-span-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
        />
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
        />

        <div className="sm:col-span-6 flex items-center">
          <label className="flex items-center gap-2 text-xs font-medium text-[#1A1216] cursor-pointer">
            <input
              type="checkbox"
              checked={firstOrderOnly}
              onChange={(e) => setFirstOrderOnly(e.target.checked)}
            />
            Válido apenas para primeira compra
          </label>
        </div>

        <div className="sm:col-span-6 flex justify-end">
          <button
            type="submit"
            className="da-btn-3d inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Criar Cupom
          </button>
        </div>
      </form>

      <div className="da-admin-card overflow-x-auto rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#781B68]/10 bg-[#FFF5EB] text-xs font-bold text-[#310D2B]">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Desconto</th>
              <th className="px-4 py-3">Pedido mínimo</th>
              <th className="px-4 py-3">Usos</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {coupons.map((c) => (
              <tr key={c.code} className="hover:bg-[#FFF5EB]/50">
                <td className="px-4 py-3 font-mono-tabular font-bold text-[#781B68]">{c.code}</td>
                <td className="px-4 py-3 font-mono-tabular">
                  {c.type === 'percent' ? `${c.value}%` : formatBRL(c.value)}
                </td>
                <td className="px-4 py-3 font-mono-tabular">{formatBRL(c.minOrderValue)}</td>
                <td className="px-4 py-3 font-mono-tabular text-xs">
                  {c.usedCount} / {c.maxUses}
                </td>
                <td className="px-4 py-3 font-mono-tabular text-xs">{c.expiresAt || 'Sem limite'}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleActive(c)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                      c.active
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {c.active ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void handleDelete(c)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

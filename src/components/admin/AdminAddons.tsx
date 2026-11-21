import React, { useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import type { Addon, AddonGroup } from '../../types/domain.ts';
import { writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL, slugify } from '../../lib/formatters.ts';

interface AdminAddonsProps {
  addons: Addon[];
}

export const AdminAddons: React.FC<AdminAddonsProps> = ({ addons }) => {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<AddonGroup>('cremes');
  const [price, setPrice] = useState('3.50');
  const [maxQty, setMaxQty] = useState('2');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const id = `add_${slugify(name)}_${Date.now().toString().slice(-4)}`;
    try {
      await setDoc(doc(db, 'addons', id), {
        name: name.trim(),
        group,
        price: Number(price) || 0,
        available: true,
        maxQty: Math.max(1, Number(maxQty) || 2),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('addon_created', 'addon', id, `Adicional criado: ${name.trim()}`);
      setName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `addons/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (addon: Addon) => {
    try {
      await updateDoc(doc(db, 'addons', addon.id), {
        available: !addon.available,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `addons/${addon.id}`);
    }
  };

  const handleDelete = async (addon: Addon) => {
    try {
      await deleteDoc(doc(db, 'addons', addon.id));
      await writeAuditLog('addon_deleted', 'addon', addon.id, `Adicional removido: ${addon.name}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `addons/${addon.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#310D2B]">Adicionais e Complementos</h1>
        <p className="text-sm text-[#5C4952]">
          Gerencie cremes, frutas, caldas, crocantes e complementos disponíveis na montagem do pedido.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="da-admin-card grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-2xl p-4"
      >
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Nutella, Granola, Morango)"
          className="sm:col-span-4 rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-[#781B68] focus:outline-none"
        />
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as AddonGroup)}
          className="sm:col-span-3 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[#781B68] focus:outline-none"
        >
          <option value="cremes">Cremes</option>
          <option value="frutas">Frutas</option>
          <option value="caldas">Caldas</option>
          <option value="crocantes">Crocantes</option>
          <option value="especiais">Especiais</option>
        </select>
        <input
          type="number"
          step="0.5"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preço R$"
          className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular focus:border-[#781B68] focus:outline-none"
        />
        <input
          type="number"
          min="1"
          max="20"
          value={maxQty}
          onChange={(e) => setMaxQty(e.target.value)}
          placeholder="Máx"
          className="sm:col-span-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular focus:border-[#781B68] focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="da-btn-3d sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </form>

      <div className="da-admin-card overflow-x-auto rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#781B68]/10 bg-[#FFF5EB] text-xs font-bold text-[#310D2B]">
            <tr>
              <th className="px-4 py-3">Adicional</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3 text-right">Preço</th>
              <th className="px-4 py-3">Disponibilidade</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {addons.map((a) => (
              <tr key={a.id} className="hover:bg-[#FFF5EB]/50">
                <td className="px-4 py-3 font-semibold text-[#310D2B]">{a.name}</td>
                <td className="px-4 py-3 text-xs capitalize text-[#5C4952]">{a.group}</td>
                <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#781B68]">
                  {a.price > 0 ? formatBRL(a.price) : 'Grátis'}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleAvailable(a)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                      a.available
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {a.available ? 'Ativo' : 'Desativado'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void handleDelete(a)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50 cursor-pointer"
                    title="Remover"
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

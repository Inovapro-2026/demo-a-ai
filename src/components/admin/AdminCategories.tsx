import React, { useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import type { Category } from '../../types/domain.ts';
import { writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { slugify } from '../../lib/formatters.ts';

interface AdminCategoriesProps {
  categories: Category[];
}

export const AdminCategories: React.FC<AdminCategoriesProps> = ({ categories }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(categories.length + 1);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const id = `cat_${slugify(name)}_${Date.now().toString().slice(-4)}`;
    try {
      await setDoc(doc(db, 'categories', id), {
        name: name.trim(),
        slug: slugify(name),
        description: description.trim(),
        sortOrder: Number(sortOrder) || 1,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('category_created', 'category', id, `Categoria criada: ${name.trim()}`);
      setName('');
      setDescription('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `categories/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat: Category) => {
    try {
      await updateDoc(doc(db, 'categories', cat.id), {
        active: !cat.active,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `categories/${cat.id}`);
    }
  };

  const handleDelete = async (cat: Category) => {
    try {
      await deleteDoc(doc(db, 'categories', cat.id));
      await writeAuditLog('category_deleted', 'category', cat.id, `Categoria removida: ${cat.name}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `categories/${cat.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#310D2B]">Categorias</h1>
        <p className="text-sm text-[#5C4952]">
          Organize as seções do cardápio exibidas na loja pública.
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
          placeholder="Nome da categoria (ex.: Milkshakes)"
          className="sm:col-span-4 rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-[#781B68] focus:outline-none"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição breve (opcional)"
          className="sm:col-span-5 rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-[#781B68] focus:outline-none"
        />
        <input
          type="number"
          min="1"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
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
              <th className="px-4 py-3">Ordem</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-[#FFF5EB]/50">
                <td className="px-4 py-3 font-mono-tabular">{cat.sortOrder}</td>
                <td className="px-4 py-3 font-semibold text-[#310D2B]">{cat.name}</td>
                <td className="px-4 py-3 font-mono-tabular text-xs text-[#5C4952]">{cat.slug}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleActive(cat)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                      cat.active
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {cat.active ? 'Ativa' : 'Oculta'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void handleDelete(cat)}
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

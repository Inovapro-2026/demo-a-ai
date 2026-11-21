import React, { useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Archive, Edit2, Plus, Upload, X } from 'lucide-react';
import type { Category, Product, ProductOption } from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { uploadAdminImage, writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL } from '../../lib/formatters.ts';

interface AdminProductsProps {
  products: Product[];
  categories: Category[];
}

const EMPTY_PRODUCT: Omit<Product, 'id'> = {
  name: '',
  description: '',
  categoryId: '',
  categoryName: '',
  price: 25,
  promoPrice: null,
  imageUrl: '/src/assets/images/product_acai_tigela_1795280701252.jpg',
  available: true,
  archived: false,
  featured: false,
  bestSeller: false,
  isNew: false,
  allowAddons: true,
  sizes: [
    { id: 'sz_300', name: '300 ml', priceDelta: 0 },
    { id: 'sz_500', name: '500 ml', priceDelta: 6 },
  ],
  bases: [{ id: 'bs_trad', name: 'Açaí Tradicional', priceDelta: 0 }],
  ratingAvg: 0,
  ratingCount: 0,
};

export const AdminProducts: React.FC<AdminProductsProps> = ({ products, categories }) => {
  const { getIdToken } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<Product, 'id'>>(EMPTY_PRODUCT);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeProducts = products.filter((p) => !p.archived);

  const openCreate = () => {
    const firstCat = categories[0];
    setEditingId(null);
    setForm({
      ...EMPTY_PRODUCT,
      categoryId: firstCat?.id || 'cat_acai_tigela',
      categoryName: firstCat?.name || 'Açaí na Tigela',
    });
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      price: p.price,
      promoPrice: p.promoPrice ?? null,
      imageUrl: p.imageUrl,
      available: p.available,
      archived: p.archived,
      featured: p.featured,
      bestSeller: p.bestSeller,
      isNew: p.isNew,
      allowAddons: p.allowAddons,
      sizes: p.sizes?.length ? p.sizes : [],
      bases: p.bases?.length ? p.bases : [],
      ratingAvg: p.ratingAvg || 0,
      ratingCount: p.ratingCount || 0,
    });
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const url = await uploadAdminImage(file, getIdToken);
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro no upload da foto.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setErrorMsg(null);

    const cat = categories.find((c) => c.id === form.categoryId);
    const id = editingId || `prod_${Date.now()}`;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId || cat?.id || 'cat_acai_tigela',
      categoryName: cat?.name || form.categoryName || 'Açaí',
      price: Number(form.price) || 0,
      promoPrice:
        form.promoPrice && Number(form.promoPrice) > 0 ? Number(form.promoPrice) : null,
      imageUrl: form.imageUrl.trim() || '/src/assets/images/product_acai_tigela_1795280701252.jpg',
      available: form.available,
      archived: form.archived,
      featured: form.featured,
      bestSeller: form.bestSeller,
      isNew: form.isNew,
      allowAddons: form.allowAddons,
      sizes: form.sizes,
      bases: form.bases,
      ratingAvg: Number(form.ratingAvg) || 0,
      ratingCount: Number(form.ratingCount) || 0,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'products', id), payload);
        await writeAuditLog('product_updated', 'product', id, `Produto atualizado: ${payload.name}`);
      } else {
        await setDoc(doc(db, 'products', id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await writeAuditLog('product_created', 'product', id, `Produto criado: ${payload.name}`);
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (p: Product) => {
    try {
      await updateDoc(doc(db, 'products', p.id), {
        available: !p.available,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${p.id}`);
    }
  };

  const archiveProduct = async (p: Product) => {
    try {
      // Soft archive preserves order history integrity
      await updateDoc(doc(db, 'products', p.id), {
        archived: true,
        available: false,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('product_archived', 'product', p.id, `Produto arquivado: ${p.name}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${p.id}`);
    }
  };

  const updateOptionList = (
    key: 'sizes' | 'bases',
    index: number,
    field: keyof ProductOption,
    value: string
  ) => {
    setForm((prev) => {
      const list = [...prev[key]];
      const item = { ...list[index] };
      if (field === 'priceDelta') item.priceDelta = Number(value) || 0;
      else if (field === 'name') item.name = value;
      list[index] = item;
      return { ...prev, [key]: list };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Cadastro de Produtos</h1>
          <p className="text-sm text-[#5C4952]">
            Produtos salvos aqui refletem instantaneamente na loja online. A exclusão usa arquivamento seguro para preservar históricos de pedidos.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="da-btn-3d inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Novo Produto
        </button>
      </div>

      <div className="da-admin-card overflow-x-auto rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#781B68]/10 bg-[#FFF5EB] text-xs font-bold text-[#310D2B]">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3 text-right">Preço</th>
              <th className="px-4 py-3">Disponibilidade</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {activeProducts.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-50/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="h-11 w-14 rounded-lg object-cover border border-neutral-200 shrink-0"
                    />
                    <div>
                      <div className="font-semibold text-[#1A1216]">{p.name}</div>
                      <div className="text-xs text-[#5C4952]">
                        {[
                          p.featured && 'Destaque',
                          p.bestSeller && 'Mais vendido',
                          p.isNew && 'Novidade',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Padrão'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-[#3D2E35]">{p.categoryName}</td>
                <td className="px-4 py-3 text-right font-mono-tabular">
                  {p.promoPrice && p.promoPrice < p.price ? (
                    <div>
                      <div className="font-bold text-[#781B68]">{formatBRL(p.promoPrice)}</div>
                      <div className="text-xs text-neutral-400 line-through">{formatBRL(p.price)}</div>
                    </div>
                  ) : (
                    <span className="font-bold text-[#310D2B]">{formatBRL(p.price)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleAvailability(p)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                      p.available
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {p.available ? 'Disponível' : 'Pausado'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-lg border border-neutral-200 p-2 text-[#1A1216] hover:bg-neutral-100 cursor-pointer"
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveProduct(p)}
                      className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 cursor-pointer"
                      title="Arquivar produto"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#310D2B]/65 backdrop-blur-sm p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#781B68]/20 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#781B68]/10 bg-[#FFF5EB] px-5 py-4">
              <h2 className="font-display text-lg font-bold text-[#310D2B]">
                {editingId ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-[#310D2B] hover:bg-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">Nome *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">Categoria *</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1A1216]">Descrição *</label>
                <textarea
                  rows={2}
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">Preço base (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1A1216]">Preço promocional (opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.promoPrice ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        promoPrice: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div className="rounded-xl border border-neutral-200 bg-[#FAF7F4] p-3.5 space-y-2">
                <label className="block text-xs font-semibold text-[#1A1216]">Foto do produto</label>
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="h-16 w-20 rounded-xl object-cover border border-neutral-200"
                  />
                  <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#1A1216] hover:bg-neutral-50 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? 'Enviando...' : 'Enviar nova foto'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void handleImageFile(e)}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="Ou informe o caminho da imagem"
                    className="flex-1 min-w-[200px] rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Sizes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1216]">Tamanhos</span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        sizes: [...prev.sizes, { id: `sz_${Date.now()}`, name: 'Novo tamanho', priceDelta: 0 }],
                      }))
                    }
                    className="text-xs font-semibold text-[#4A1230] hover:underline cursor-pointer"
                  >
                    + Adicionar tamanho
                  </button>
                </div>
                {form.sizes.map((sz, idx) => (
                  <div key={sz.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sz.name}
                      onChange={(e) => updateOptionList('sizes', idx, 'name', e.target.value)}
                      placeholder="Ex.: 500 ml"
                      className="flex-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={sz.priceDelta}
                      onChange={(e) => updateOptionList('sizes', idx, 'priceDelta', e.target.value)}
                      placeholder="Acréscimo R$"
                      className="w-28 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono-tabular"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          sizes: prev.sizes.filter((_, i) => i !== idx),
                        }))
                      }
                      className="text-red-600 p-1 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Flags */}
              <div className="flex flex-wrap gap-4 pt-1 text-xs font-medium text-[#1A1216]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.available}
                    onChange={(e) => setForm({ ...form, available: e.target.checked })}
                  />
                  Disponível para venda
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowAddons}
                    onChange={(e) => setForm({ ...form, allowAddons: e.target.checked })}
                  />
                  Permite adicionais
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                  />
                  Destaque
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.bestSeller}
                    onChange={(e) => setForm({ ...form, bestSeller: e.target.checked })}
                  />
                  Mais vendido
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isNew}
                    onChange={(e) => setForm({ ...form, isNew: e.target.checked })}
                  />
                  Novidade
                </label>
              </div>

              {errorMsg && <p className="text-xs font-medium text-red-700">{errorMsg}</p>}

              <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-[#310D2B] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="da-btn-3d rounded-xl px-5 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

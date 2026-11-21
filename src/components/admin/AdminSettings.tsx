import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, Save, Trash2, Upload } from 'lucide-react';
import type { StoreSettings } from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { uploadAdminImage, writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';

interface AdminSettingsProps {
  settings: StoreSettings;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ settings }) => {
  const { getIdToken } = useAuth();
  const [form, setForm] = useState<StoreSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleImageUpload = async (
    field: 'logoUrl' | 'bannerUrl' | 'faviconUrl',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingField(field);
    try {
      const url = await uploadAdminImage(file, getIdToken);
      setForm((prev) => ({ ...prev, [field]: url }));
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedToast(false);
    try {
      await setDoc(doc(db, 'storeSettings', 'main'), {
        storeName: form.storeName.trim() || 'Dois Amores',
        description: form.description.trim(),
        logoUrl: form.logoUrl.trim(),
        faviconUrl: form.faviconUrl?.trim() || '',
        bannerUrl: form.bannerUrl.trim(),
        promoBannerTitle: form.promoBannerTitle?.trim() || '',
        promoBannerSubtitle: form.promoBannerSubtitle?.trim() || '',
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        accentColor: form.accentColor,
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim(),
        address: form.address.trim(),
        cnpj: form.cnpj?.trim() || '',
        openingHours: form.openingHours.trim(),
        openingDays: form.openingDays.trim(),
        isOpen: form.isOpen,
        pauseOrders: form.pauseOrders,
        closedMessage: form.closedMessage?.trim() || '',
        deliveryFeeFixed: Number(form.deliveryFeeFixed) || 0,
        minOrderValue: Number(form.minOrderValue) || 0,
        estimatedDeliveryMinutes: Math.max(5, Number(form.estimatedDeliveryMinutes) || 30),
        neighborhoodFees: form.neighborhoodFees || [],
        pickupEnabled: form.pickupEnabled,
        deliveryEnabled: form.deliveryEnabled,
        pixEnabled: form.pixEnabled,
        cashEnabled: form.cashEnabled,
        cardEnabled: form.cardEnabled,
        pixKey: form.pixKey?.trim() || '',
        pixReceiverName: form.pixReceiverName?.trim() || '',
        requireReviewModeration: form.requireReviewModeration ?? true,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog(
        'settings_updated',
        'storeSettings',
        'main',
        'Configurações da loja atualizadas pelo administrador.'
      );
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'storeSettings/main');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Configurações da Loja</h1>
          <p className="text-sm text-[#5C4952]">
            Todas as alterações salvas refletem automaticamente na loja pública sem editar código.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="da-btn-3d inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>

      {savedToast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Configurações salvas e aplicadas na loja online!
        </div>
      )}

      {/* Funcionamento */}
      <section className="da-admin-card rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-bold text-[#310D2B]">Funcionamento e Recebimento</h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => setForm({ ...form, isOpen: e.target.checked })}
            />
            Loja aberta
          </label>
          <label className="flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={form.pauseOrders}
              onChange={(e) => setForm({ ...form, pauseOrders: e.target.checked })}
            />
            Pausar recebimento de pedidos temporariamente
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1A1216]">Aviso de loja fechada/pausada</label>
          <input
            type="text"
            value={form.closedMessage || ''}
            onChange={(e) => setForm({ ...form, closedMessage: e.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </section>

      {/* Identidade Visual */}
      <section className="da-admin-card rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-bold text-[#310D2B]">Identidade Visual e Marca</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Nome da loja</label>
            <input
              type="text"
              required
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Título do banner principal</label>
            <input
              type="text"
              value={form.promoBannerTitle || ''}
              onChange={(e) => setForm({ ...form, promoBannerTitle: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1A1216]">Descrição institucional</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Cor predominante</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="h-9 w-12 rounded border border-neutral-300 cursor-pointer"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-mono-tabular"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Cor secundária</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={form.secondaryColor}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                className="h-9 w-12 rounded border border-neutral-300 cursor-pointer"
              />
              <input
                type="text"
                value={form.secondaryColor}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-mono-tabular"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Cor dourada / destaque</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                className="h-9 w-12 rounded border border-neutral-300 cursor-pointer"
              />
              <input
                type="text"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-mono-tabular"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-200 p-3 space-y-2">
            <div className="text-xs font-semibold text-[#1A1216]">Logo da loja</div>
            <div className="flex items-center gap-3">
              <img src={form.logoUrl} alt="Logo" className="h-12 w-12 rounded-full object-cover border" />
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-semibold cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                {uploadingField === 'logoUrl' ? 'Enviando...' : 'Trocar logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleImageUpload('logoUrl', e)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 space-y-2">
            <div className="text-xs font-semibold text-[#1A1216]">Banner principal</div>
            <div className="flex items-center gap-3">
              <img src={form.bannerUrl} alt="Banner" className="h-12 w-20 rounded-lg object-cover border" />
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-semibold cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                {uploadingField === 'bannerUrl' ? 'Enviando...' : 'Trocar banner'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleImageUpload('bannerUrl', e)}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Informações Comerciais */}
      <section className="da-admin-card rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-bold text-[#310D2B]">Informações Comerciais</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Telefone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">WhatsApp (com DDI 55)</label>
            <input
              type="text"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">CNPJ</label>
            <input
              type="text"
              value={form.cnpj || ''}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#1A1216]">Endereço</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Dias de funcionamento</label>
            <input
              type="text"
              value={form.openingDays}
              onChange={(e) => setForm({ ...form, openingDays: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Horário</label>
            <input
              type="text"
              value={form.openingHours}
              onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Entrega e Pagamentos */}
      <section className="da-admin-card rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-bold text-[#310D2B]">Entrega e Pagamentos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Taxa fixa padrão (R$)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={form.deliveryFeeFixed}
              onChange={(e) => setForm({ ...form, deliveryFeeFixed: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Pedido mínimo (R$)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.minOrderValue}
              onChange={(e) => setForm({ ...form, minOrderValue: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Tempo estimado (min)</label>
            <input
              type="number"
              min="5"
              value={form.estimatedDeliveryMinutes}
              onChange={(e) => setForm({ ...form, estimatedDeliveryMinutes: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
            />
          </div>
        </div>

        {/* Neighborhood Fees */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1A1216]">Taxas por bairro</span>
            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  neighborhoodFees: [...(prev.neighborhoodFees || []), { neighborhood: '', fee: 7 }],
                }))
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#781B68] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar bairro
            </button>
          </div>
          {(form.neighborhoodFees || []).map((nf, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={nf.neighborhood}
                onChange={(e) => {
                  const next = [...form.neighborhoodFees];
                  next[idx] = { ...next[idx], neighborhood: e.target.value };
                  setForm({ ...form, neighborhoodFees: next });
                }}
                placeholder="Nome do bairro"
                className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                step="0.5"
                min="0"
                value={nf.fee}
                onChange={(e) => {
                  const next = [...form.neighborhoodFees];
                  next[idx] = { ...next[idx], fee: Number(e.target.value) || 0 };
                  setForm({ ...form, neighborhoodFees: next });
                }}
                className="w-28 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-mono-tabular"
              />
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    neighborhoodFees: form.neighborhoodFees.filter((_, i) => i !== idx),
                  })
                }
                className="p-2 text-red-700 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-5 pt-2 text-xs font-semibold text-[#1A1216]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.deliveryEnabled}
              onChange={(e) => setForm({ ...form, deliveryEnabled: e.target.checked })}
            />
            Entrega ativa
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pickupEnabled}
              onChange={(e) => setForm({ ...form, pickupEnabled: e.target.checked })}
            />
            Retirada no balcão
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pixEnabled}
              onChange={(e) => setForm({ ...form, pixEnabled: e.target.checked })}
            />
            Pix ativo
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.cardEnabled}
              onChange={(e) => setForm({ ...form, cardEnabled: e.target.checked })}
            />
            Cartão na entrega/retirada
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.cashEnabled}
              onChange={(e) => setForm({ ...form, cashEnabled: e.target.checked })}
            />
            Dinheiro ativo
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Chave Pix exibida ao cliente</label>
            <input
              type="text"
              value={form.pixKey || ''}
              onChange={(e) => setForm({ ...form, pixKey: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1216]">Nome do favorecido Pix</label>
            <input
              type="text"
              value={form.pixReceiverName || ''}
              onChange={(e) => setForm({ ...form, pixReceiverName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>
    </form>
  );
};

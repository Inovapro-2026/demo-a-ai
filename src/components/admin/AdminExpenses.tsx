import React, { useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { Expense } from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { uploadAdminImage, writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL } from '../../lib/formatters.ts';

interface AdminExpensesProps {
  expenses: Expense[];
}

export const AdminExpenses: React.FC<AdminExpensesProps> = ({ expenses }) => {
  const { getIdToken } = useAuth();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Insumos');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<Expense['paymentMethod']>('pix');
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAdminImage(file, getIdToken);
      setReceiptUrl(url);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount.replace(',', '.'));
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return;

    setSaving(true);
    const id = `exp_${Date.now()}`;
    try {
      await setDoc(doc(db, 'expenses', id), {
        description: description.trim(),
        category,
        amount: numericAmount,
        date,
        paymentMethod,
        status,
        receiptUrl: receiptUrl.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog(
        'expense_created',
        'expense',
        id,
        `Despesa lançada: ${description.trim()} (${formatBRL(numericAmount)})`
      );
      setDescription('');
      setAmount('');
      setReceiptUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `expenses/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const togglePaid = async (exp: Expense) => {
    try {
      await updateDoc(doc(db, 'expenses', exp.id), {
        status: exp.status === 'paid' ? 'pending' : 'paid',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `expenses/${exp.id}`);
    }
  };

  const handleDelete = async (exp: Expense) => {
    try {
      await deleteDoc(doc(db, 'expenses', exp.id));
      await writeAuditLog('expense_deleted', 'expense', exp.id, `Despesa removida: ${exp.description}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${exp.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#310D2B]">Despesas e Contas a Pagar</h1>
        <p className="text-sm text-[#5C4952]">
          Registre compras de insumos, embalagens, energia, entregas e anexos de comprovantes.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="da-admin-card grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-2xl p-4"
      >
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição da despesa"
          className="sm:col-span-4 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="sm:col-span-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="Insumos">Insumos</option>
          <option value="Embalagens">Embalagens</option>
          <option value="Aluguel e Contas">Aluguel e Contas</option>
          <option value="Motoboy e Entregas">Motoboy e Entregas</option>
          <option value="Marketing">Marketing</option>
          <option value="Outros">Outros</option>
        </select>
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Valor R$"
          className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono-tabular"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as Expense['paymentMethod'])}
          className="sm:col-span-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="pix">Pix</option>
          <option value="cash">Dinheiro</option>
          <option value="card">Cartão</option>
          <option value="transfer">Transferência</option>
          <option value="boleto">Boleto</option>
        </select>

        <div className="sm:col-span-4 flex items-center gap-3 text-xs">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'paid' | 'pending')}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs"
          >
            <option value="paid">Pago</option>
            <option value="pending">A pagar (pendente)</option>
          </select>

          <label className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 font-semibold text-[#1A1216] hover:bg-neutral-50 cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Enviando...' : receiptUrl ? 'Comprovante anexado' : 'Comprovante'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void handleReceiptUpload(e)}
              className="hidden"
            />
          </label>
        </div>

        <div className="sm:col-span-8 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="da-btn-3d inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Registrar Despesa
          </button>
        </div>
      </form>

      <div className="da-admin-card overflow-x-auto rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#781B68]/10 bg-[#FFF5EB] text-xs font-bold text-[#310D2B]">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#5C4952]">
                  Nenhuma despesa registrada ainda.
                </td>
              </tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id}>
                  <td className="px-4 py-3 font-mono-tabular text-xs">{exp.date}</td>
                  <td className="px-4 py-3 font-semibold text-[#1A1216]">
                    {exp.description}
                    {exp.receiptUrl && (
                      <a
                        href={exp.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-xs font-normal text-[#4A1230] underline"
                      >
                        Ver comprovante
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#5C4952]">{exp.category}</td>
                  <td className="px-4 py-3 text-xs uppercase">{exp.paymentMethod}</td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-bold text-red-700">
                    {formatBRL(exp.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void togglePaid(exp)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                        exp.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {exp.status === 'paid' ? 'Pago' : 'Em aberto'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(exp)}
                      className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

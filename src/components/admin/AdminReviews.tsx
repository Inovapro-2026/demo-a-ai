import React, { useMemo, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, EyeOff, MessageSquareReply, Star, Trash2 } from 'lucide-react';
import type { Review, ReviewStatus } from '../../types/domain.ts';
import { writeAuditLog } from '../../lib/adminHelpers.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatDateTimeBR } from '../../lib/formatters.ts';

interface AdminReviewsProps {
  reviews: Review[];
}

export const AdminReviews: React.FC<AdminReviewsProps> = ({ reviews }) => {
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | 'all'>('pending');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return reviews;
    return reviews.filter((r) => r.status === filterStatus);
  }, [reviews, filterStatus]);

  const syncProductRating = async (productId: string, nextReviews: Review[]) => {
    const approvedForProd = nextReviews.filter(
      (r) => r.productId === productId && r.status === 'approved'
    );
    const count = approvedForProd.length;
    const avg =
      count > 0
        ? Number((approvedForProd.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(2))
        : 0;
    try {
      await updateDoc(doc(db, 'products', productId), {
        ratingAvg: avg,
        ratingCount: count,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Product may be archived or deleted
    }
  };

  const handleModerate = async (review: Review, nextStatus: ReviewStatus) => {
    setBusyId(review.id);
    const replyText =
      replyDrafts[review.id] !== undefined ? replyDrafts[review.id].trim() : review.adminReply || '';
    try {
      await updateDoc(doc(db, 'reviews', review.id), {
        status: nextStatus,
        adminReply: replyText,
        updatedAt: serverTimestamp(),
      });
      const updatedList = reviews.map((r) =>
        r.id === review.id ? { ...r, status: nextStatus, adminReply: replyText } : r
      );
      await syncProductRating(review.productId, updatedList);
      await writeAuditLog(
        `review_${nextStatus}`,
        'review',
        review.id,
        `Avaliação de ${review.customerName} para ${review.productName} marcada como ${nextStatus}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reviews/${review.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (review: Review) => {
    setBusyId(review.id);
    try {
      await deleteDoc(doc(db, 'reviews', review.id));
      const updatedList = reviews.filter((r) => r.id !== review.id);
      await syncProductRating(review.productId, updatedList);
      await writeAuditLog(
        'review_deleted',
        'review',
        review.id,
        `Avaliação removida: ${review.productName} (${review.customerName})`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `reviews/${review.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const counts = {
    pending: reviews.filter((r) => r.status === 'pending').length,
    approved: reviews.filter((r) => r.status === 'approved').length,
    rejected: reviews.filter((r) => r.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#310D2B]">
          Moderação de Avaliações
        </h1>
        <p className="text-sm text-[#5C4952]">
          Aprove avaliações pós-compra para exibição na loja pública, responda clientes ou oculte comentários inadequados.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'pending', label: `Pendentes (${counts.pending})` },
            { id: 'approved', label: `Publicadas (${counts.approved})` },
            { id: 'rejected', label: `Ocultas (${counts.rejected})` },
            { id: 'all', label: `Todas (${reviews.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterStatus(tab.id)}
            className={`rounded-2xl px-4 py-2 text-xs font-bold cursor-pointer transition ${
              filterStatus === tab.id
                ? 'da-btn-3d text-white'
                : 'border border-[#781B68]/15 bg-white text-[#3D2E35] hover:bg-[#FFF5EB]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="da-admin-card rounded-3xl p-10 text-center text-sm text-[#5C4952]">
          Nenhuma avaliação encontrada nesta fila.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((rev) => (
            <div
              key={rev.id}
              className="da-admin-card rounded-3xl p-5 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#5C4952]">
                    <span className="font-bold text-[#781B68]">{rev.productName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{rev.customerName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTimeBR(rev.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-4 w-4 ${
                          s <= rev.rating ? 'fill-[#E6AE52] text-[#E6AE52]' : 'text-neutral-300'
                        }`}
                      />
                    ))}
                    <span className="font-mono-tabular text-xs font-bold text-[#310D2B] ml-1.5">
                      {rev.rating}.0
                    </span>
                  </div>
                </div>

                <span
                  className={`text-xs font-semibold ${
                    rev.status === 'approved'
                      ? 'text-emerald-700'
                      : rev.status === 'rejected'
                      ? 'text-red-700'
                      : 'text-amber-700'
                  }`}
                >
                  {rev.status === 'approved'
                    ? 'Exibida na loja'
                    : rev.status === 'rejected'
                    ? 'Oculta'
                    : 'Aguardando moderação'}
                </span>
              </div>

              <p className="text-sm text-[#1A1216] leading-relaxed">“{rev.comment}”</p>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <div className="relative flex-1">
                  <MessageSquareReply className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    maxLength={500}
                    value={
                      replyDrafts[rev.id] !== undefined ? replyDrafts[rev.id] : rev.adminReply || ''
                    }
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))
                    }
                    placeholder="Resposta pública da Dois Amores (opcional)..."
                    className="w-full rounded-xl border border-neutral-300 pl-9 pr-3 py-2 text-xs focus:border-[#4A1230] focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === rev.id}
                    onClick={() => void handleModerate(rev, 'approved')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Aprovar e exibir
                  </button>
                  <button
                    type="button"
                    disabled={busyId === rev.id}
                    onClick={() => void handleModerate(rev, 'rejected')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-semibold text-[#3D2E35] hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Ocultar
                  </button>
                  <button
                    type="button"
                    disabled={busyId === rev.id}
                    onClick={() => void handleDelete(rev)}
                    className="rounded-xl border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                    title="Excluir avaliação"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

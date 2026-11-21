import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { CheckCircle, MessageCircle, Send } from 'lucide-react';
import type { ChatMessage, Conversation, Order } from '../../types/domain.ts';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { formatBRL, formatDateTimeBR, ORDER_STATUS_LABELS } from '../../lib/formatters.ts';

interface AdminChatProps {
  conversations: Conversation[];
  orders: Order[];
}

export const AdminChat: React.FC<AdminChatProps> = ({ conversations, orders }) => {
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const selectedConv = conversations.find((c) => c.id === selectedId) || null;
  const linkedOrder = selectedConv?.orderId
    ? orders.find((o) => o.id === selectedConv.orderId)
    : selectedConv?.customerPhone
    ? orders.find(
        (o) =>
          o.customerPhone.replace(/\D/g, '') ===
          (selectedConv.customerPhone || '').replace(/\D/g, '')
      )
    : undefined;

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'conversations', selectedId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ ...(d.data() as ChatMessage), id: d.id })));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `conversations/${selectedId}/messages`);
      }
    );

    if (selectedConv?.unreadAdmin) {
      void updateDoc(doc(db, 'conversations', selectedId), {
        unreadAdmin: false,
        updatedAt: serverTimestamp(),
      });
    }

    return () => unsub();
  }, [selectedId, selectedConv?.unreadAdmin]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !replyText.trim() || sending) return;
    setSending(true);
    const text = replyText.trim();
    try {
      await addDoc(collection(db, 'conversations', selectedId, 'messages'), {
        senderRole: 'admin',
        senderName: 'Atendimento Dois Amores',
        text: text.slice(0, 990),
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'conversations', selectedId), {
        lastMessage: text.slice(0, 280),
        unreadAdmin: false,
        updatedAt: serverTimestamp(),
      });
      setReplyText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `conversations/${selectedId}/messages`);
    } finally {
      setSending(false);
    }
  };

  const toggleStatus = async (conv: Conversation) => {
    try {
      await updateDoc(doc(db, 'conversations', conv.id), {
        status: conv.status === 'open' ? 'closed' : 'open',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `conversations/${conv.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#310D2B]">Chat e Suporte</h1>
          <p className="text-sm text-[#5C4952]">
            Atendimento em tempo real pela loja online, com redirecionamento direto para WhatsApp Web/App (a integração automática via API oficial do WhatsApp pode ser conectada posteriormente via webhook).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[520px]">
        {/* Threads List */}
        <div className="da-admin-card lg:col-span-4 rounded-2xl overflow-hidden flex flex-col">
          <div className="border-b border-[#781B68]/10 bg-[#FFF5EB] px-4 py-3 text-xs font-bold text-[#310D2B]">
            Conversas ({conversations.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#5C4952]">
                Nenhuma conversa iniciada pelos clientes ainda.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left p-4 transition cursor-pointer ${
                    selectedId === conv.id ? 'bg-[#FFF5EB]' : 'hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-[#310D2B] truncate">
                      {conv.customerName}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        conv.status === 'open' ? 'text-emerald-700' : 'text-neutral-500'
                      }`}
                    >
                      {conv.status === 'open' ? 'Aberto' : 'Encerrado'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#5C4952] truncate">{conv.lastMessage}</div>
                  {conv.unreadAdmin && (
                    <div className="mt-1 text-[11px] font-bold text-[#781B68]">Nova mensagem</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread Detail */}
        <div className="da-admin-card lg:col-span-8 rounded-2xl overflow-hidden flex flex-col">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-[#5C4952]">
              Selecione uma conversa para visualizar e responder.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#781B68]/10 bg-[#FFF5EB] px-5 py-3.5">
                <div>
                  <div className="font-bold text-sm text-[#310D2B]">
                    {selectedConv.customerName}{' '}
                    {selectedConv.customerPhone && (
                      <span className="font-mono-tabular text-xs font-normal text-[#5C4952]">
                        · {selectedConv.customerPhone}
                      </span>
                    )}
                  </div>
                  {linkedOrder && (
                    <div className="text-xs text-[#781B68]">
                      Último pedido: <strong className="font-mono-tabular">{linkedOrder.orderNumber}</strong> ·{' '}
                      {ORDER_STATUS_LABELS[linkedOrder.status]} · {formatBRL(linkedOrder.total)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedConv.customerPhone && (
                    <a
                      href={`https://wa.me/${selectedConv.customerPhone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleStatus(selectedConv)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#1A1216] cursor-pointer"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {selectedConv.status === 'open' ? 'Encerrar atendimento' : 'Reabrir'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-neutral-50/60">
                {messages.map((m) => {
                  const isAdminMsg = m.senderRole === 'admin';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isAdminMsg ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                          isAdminMsg
                            ? 'bg-gradient-to-br from-[#781B68] to-[#310D2B] text-white shadow-sm'
                            : 'border border-[#781B68]/15 bg-white text-[#1A1216]'
                        }`}
                      >
                        <div className="font-semibold opacity-80 mb-0.5">{m.senderName}</div>
                        <div>{m.text}</div>
                        <div className="mt-1 text-[10px] opacity-65">
                          {formatDateTimeBR(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => void handleSend(e)}
                className="flex items-center gap-2 border-t border-neutral-200 bg-white p-3.5"
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Escreva sua resposta ao cliente..."
                  className="flex-1 rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-[#781B68] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="da-btn-3d inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

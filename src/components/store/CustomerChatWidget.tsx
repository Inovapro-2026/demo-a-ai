import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { MessageCircle, MessageSquare, Send, X } from 'lucide-react';
import type { ChatMessage, LocalTrackedOrderRef, StoreSettings } from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase.ts';

interface CustomerChatWidgetProps {
  settings: StoreSettings;
  latestOrder: LocalTrackedOrderRef | null;
}

const CONV_STORAGE_KEY = 'dois_amores_conv_id';

function generateConvId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 20; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `conv_${rand}`;
}

export const CustomerChatWidget: React.FC<CustomerChatWidgetProps> = ({
  settings,
  latestOrder,
}) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>(() => {
    const saved = localStorage.getItem(CONV_STORAGE_KEY);
    if (saved && /^conv_[a-zA-Z0-9_-]{16,}$/.test(saved)) return saved;
    const created = generateConvId();
    localStorage.setItem(CONV_STORAGE_KEY, created);
    return created;
  });
  const [customerName, setCustomerName] = useState(user?.displayName || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const convRef = doc(db, 'conversations', conversationId);
    const unsubConv = onSnapshot(
      convRef,
      (snap) => {
        if (snap.exists()) {
          setHasStarted(true);
        }
      },
      () => {
        // Conversation may not exist yet before first message
      }
    );

    const msgsQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubMsgs = onSnapshot(
      msgsQuery,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ ...(d.data() as ChatMessage), id: d.id })));
      },
      () => {
        // Ignore until conversation exists
      }
    );

    return () => {
      unsubConv();
      unsubMsgs();
    };
  }, [open, conversationId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = draftText.trim();
    if (!cleanText || sending) return;

    const cleanName = customerName.trim() || 'Cliente';
    setSending(true);
    try {
      const convRef = doc(db, 'conversations', conversationId);
      if (!hasStarted) {
        await setDoc(convRef, {
          customerName: cleanName,
          customerPhone: customerPhone.trim(),
          customerUid: user?.emailVerified ? user.uid : null,
          orderId: latestOrder?.orderId || '',
          orderNumber: latestOrder?.orderNumber || '',
          status: 'open',
          lastMessage: cleanText.slice(0, 280),
          unreadAdmin: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setHasStarted(true);
      } else {
        await updateDoc(convRef, {
          lastMessage: cleanText.slice(0, 280),
          unreadAdmin: true,
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        senderRole: 'customer',
        senderName: cleanName,
        text: cleanText.slice(0, 990),
        createdAt: serverTimestamp(),
      });

      setDraftText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `conversations/${conversationId}`);
    } finally {
      setSending(false);
    }
  };

  const handleStartNewChat = () => {
    const nextId = generateConvId();
    localStorage.setItem(CONV_STORAGE_KEY, nextId);
    setConversationId(nextId);
    setHasStarted(false);
    setMessages([]);
  };

  const whatsappClean = (settings.whatsapp || '').replace(/\D/g, '');

  return (
    <div className="fixed bottom-20 md:bottom-5 right-4 z-40 no-print">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="da-btn-3d inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white cursor-pointer"
          aria-label="Abrir atendimento"
        >
          <MessageSquare className="h-4 w-4 text-[#E6AE52]" />
          <span className="hidden sm:inline">Atendimento</span>
        </button>
      ) : (
        <div className="da-card-3d flex h-[430px] w-[320px] sm:w-[360px] flex-col overflow-hidden rounded-3xl bg-white">
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{
              background: 'linear-gradient(135deg, #310D2B 0%, #4A123F 60%, #781B68 100%)',
            }}
          >
            <div>
              <div className="text-sm font-bold">Atendimento {settings.storeName}</div>
              <div className="text-xs text-[#FBE6C2]">Chat direto com a loja</div>
            </div>
            <div className="flex items-center gap-1">
              {whatsappClean && (
                <a
                  href={`https://wa.me/${whatsappClean}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-white/90 hover:bg-white/15"
                  title="Conversar no WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/90 hover:bg-white/15 cursor-pointer"
                aria-label="Fechar atendimento"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#FAF7F4] p-3.5 space-y-2.5">
            {!hasStarted && (
              <div className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2 text-xs">
                <p className="font-semibold text-[#1A1216]">Como podemos ajudar?</p>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs focus:border-[var(--brand-primary)] focus:outline-none"
                />
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="WhatsApp (opcional)"
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs focus:border-[var(--brand-primary)] focus:outline-none"
                />
              </div>
            )}

            {messages.map((msg) => {
              const isCustomer = msg.senderRole === 'customer';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      isCustomer
                        ? 'bg-[var(--brand-primary)] text-white'
                        : 'border border-neutral-200 bg-white text-[#1A1216]'
                    }`}
                  >
                    <div className="font-semibold opacity-80 mb-0.5">{msg.senderName}</div>
                    <div>{msg.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={(e) => void handleSend(e)}
            className="flex items-center gap-2 border-t border-neutral-200 bg-white p-2.5"
          >
            <input
              type="text"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Escreva sua mensagem..."
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-[var(--brand-primary)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !draftText.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white hover:opacity-95 disabled:opacity-50 cursor-pointer"
              aria-label="Enviar mensagem"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          {hasStarted && (
            <button
              type="button"
              onClick={handleStartNewChat}
              className="border-t border-neutral-100 bg-neutral-50 py-1.5 text-[11px] font-medium text-[#5C4952] hover:text-[#1A1216] cursor-pointer"
            >
              Iniciar nova conversa
            </button>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FolderTree,
  IceCream,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  PlusCircle,
  Receipt,
  Settings,
  Star,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import type {
  Conversation,
  Coupon,
  Expense,
  Order,
  PaymentRecord,
  Review,
} from '../../types/domain.ts';
import { useAuth } from '../../hooks/useAuth.tsx';
import { useStoreData } from '../../hooks/useStoreData.tsx';
import { playNewOrderChime } from '../../lib/adminHelpers.ts';
import { db, FIREBASE_PROJECT_ID, handleFirestoreError, OperationType } from '../../lib/firebase.ts';
import { AdminAddons } from './AdminAddons.tsx';
import { AdminCategories } from './AdminCategories.tsx';
import { AdminChat } from './AdminChat.tsx';
import { AdminCoupons } from './AdminCoupons.tsx';
import { AdminCustomers } from './AdminCustomers.tsx';
import { AdminDashboard } from './AdminDashboard.tsx';
import { AdminExpenses } from './AdminExpenses.tsx';
import { AdminFinance } from './AdminFinance.tsx';
import { AdminOrders } from './AdminOrders.tsx';
import { AdminProducts } from './AdminProducts.tsx';
import { AdminReports } from './AdminReports.tsx';
import { AdminReviews } from './AdminReviews.tsx';
import { AdminSettings } from './AdminSettings.tsx';

type AdminTab =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'categories'
  | 'addons'
  | 'reviews'
  | 'customers'
  | 'finance'
  | 'expenses'
  | 'coupons'
  | 'reports'
  | 'chat'
  | 'settings';

interface AdminPanelProps {
  onBackToStore: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToStore }) => {
  const {
    user,
    loading: authLoading,
    isAdmin,
    authError,
    signInWithEmailPassword,
    sendPasswordReset,
    logout,
  } = useAuth();
  const { settings, categories, products, addons, isUsingStarterCatalog, seedCatalogIfEmpty } =
    useStoreData();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [resetSentEmail, setResetSentEmail] = useState<string | null>(null);
  const [demoHint, setDemoHint] = useState<{
    enabled: boolean;
    email: string;
    password?: string;
  }>({
    enabled: false,
    email: 'inovaprotech@gmail.com',
  });

  useEffect(() => {
    if (user && isAdmin) return;
    let cancelled = false;
    fetch('/api/admin/demo-hint')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean; email?: string; password?: string } | null) => {
        if (cancelled || !data) return;
        setDemoHint({
          enabled: Boolean(data.enabled && data.password),
          email: data.email || 'inovaprotech@gmail.com',
          password: data.password,
        });
      })
      .catch(() => {
        // Keep default email hint when offline
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newOrderToast, setNewOrderToast] = useState<string | null>(null);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const seededOnceRef = useRef(false);

  // Auto-seed starter catalog into Firestore on first authenticated admin session if empty
  useEffect(() => {
    if (isAdmin && isUsingStarterCatalog && !seededOnceRef.current) {
      seededOnceRef.current = true;
      void seedCatalogIfEmpty();
    }
  }, [isAdmin, isUsingStarterCatalog, seedCatalogIfEmpty]);

  // Subscribe to protected admin collections ONLY when authenticated as admin
  useEffect(() => {
    if (!isAdmin) return;

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Order), id: d.id }));
        if (knownOrderIdsRef.current !== null) {
          const incomingNew = list.filter(
            (o) => o.status === 'received' && !knownOrderIdsRef.current!.has(o.id)
          );
          if (incomingNew.length > 0) {
            if (soundEnabled) playNewOrderChime();
            setNewOrderToast(`Novo pedido recebido: ${incomingNew[0].orderNumber}`);
            setTimeout(() => setNewOrderToast(null), 6000);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`Novo Pedido ${incomingNew[0].orderNumber}`, {
                body: `${incomingNew[0].customerName} — R$ ${incomingNew[0].total.toFixed(2)}`,
                icon: '/pwa-192x192.png',
              });
            }
          }
        }
        knownOrderIdsRef.current = new Set(list.map((o) => o.id));
        setOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const unsubCoupons = onSnapshot(
      collection(db, 'coupons'),
      (snap) => setCoupons(snap.docs.map((d) => ({ ...(d.data() as Coupon), id: d.id }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'coupons')
    );

    const unsubExpenses = onSnapshot(
      query(collection(db, 'expenses'), orderBy('date', 'desc')),
      (snap) => setExpenses(snap.docs.map((d) => ({ ...(d.data() as Expense), id: d.id }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'expenses')
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), orderBy('createdAt', 'desc')),
      (snap) => setPayments(snap.docs.map((d) => ({ ...(d.data() as PaymentRecord), id: d.id }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubReviews = onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc')),
      (snap) => setReviews(snap.docs.map((d) => ({ ...(d.data() as Review), id: d.id }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    const unsubConversations = onSnapshot(
      query(collection(db, 'conversations'), orderBy('updatedAt', 'desc')),
      (snap) => setConversations(snap.docs.map((d) => ({ ...(d.data() as Conversation), id: d.id }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
    );

    return () => {
      unsubOrders();
      unsubCoupons();
      unsubExpenses();
      unsubPayments();
      unsubReviews();
      unsubConversations();
    };
  }, [isAdmin, soundEnabled]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5EB] text-sm font-medium text-[#5C4952]">
        Verificando credenciais administrativas...
      </div>
    );
  }

  const handleAdminEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword || submittingLogin) return;
    setSubmittingLogin(true);
    try {
      await signInWithEmailPassword(loginEmail, loginPassword);
    } finally {
      setSubmittingLogin(false);
    }
  };

  // Protected Admin Gate
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5EB] p-4">
        <div className="da-card-3d w-full max-w-md rounded-3xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <img
              src={settings.logoUrl || '/assets/aistudio/image_332d0e8c.png'}
              alt={settings.storeName}
              className="h-12 w-12 rounded-full ring-2 ring-[#781B68]/25 object-cover bg-white"
            />
            <div>
              <h1 className="font-display text-xl font-bold text-[#310D2B]">
                Painel Administrativo
              </h1>
              <p className="text-xs text-[#5C4952]">{settings.storeName} · Acesso Restrito</p>
            </div>
          </div>

          {user && !isAdmin ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-3">
              <div className="font-bold">Conta sem permissão administrativa</div>
              <p className="text-xs">
                A conta <strong>{user.email}</strong> não está autorizada a administrar esta loja.
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Sair e trocar de conta
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleAdminEmailLogin(e)} className="space-y-4">
              <p className="text-sm text-[#43353C] leading-relaxed">
                Entre com seu e-mail e senha administrativos para gerenciar pedidos, catálogo, financeiro, avaliações e configurações.
              </p>

              <div>
                <label htmlFor="admin-login-email" className="block text-xs font-bold text-[#310D2B]">
                  E-mail administrativo
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#781B68]" />
                  <input
                    id="admin-login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="seuemail@dominio.com"
                    className="w-full rounded-2xl border border-[#781B68]/20 bg-[#FFF5EB]/35 py-2.5 pl-10 pr-3.5 text-sm text-[#1A1216] placeholder:text-[#6D5A63] focus:border-[#781B68] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="admin-login-password" className="block text-xs font-bold text-[#310D2B]">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const targetEmail = loginEmail.trim() || demoHint.email;
                      setLoginEmail(targetEmail);
                      setResetSentEmail(null);
                      const ok = await sendPasswordReset(targetEmail);
                      if (ok) setResetSentEmail(targetEmail);
                    }}
                    className="text-[11px] font-semibold text-[#781B68] hover:underline cursor-pointer"
                  >
                    Redefinir senha por e-mail
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#781B68]" />
                  <input
                    id="admin-login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full rounded-2xl border border-[#781B68]/20 bg-[#FFF5EB]/35 py-2.5 pl-10 pr-10 text-sm text-[#1A1216] placeholder:text-[#6D5A63] focus:border-[#781B68] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C4952] hover:text-[#4A123F] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {resetSentEmail && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  Link de redefinição de senha enviado para <strong>{resetSentEmail}</strong>.
                </div>
              )}

              {authError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 space-y-2">
                  <p className="font-semibold">{authError}</p>
                  {authError.includes('Sign-in method') && (
                    <div className="space-y-1.5 border-t border-red-200/80 pt-2 text-[11px] leading-relaxed text-red-800">
                      <p>
                        No Firebase Console do projeto <strong>{FIREBASE_PROJECT_ID}</strong>, ative{' '}
                        <strong>E-mail/senha</strong> em <em>Authentication → Sign-in method</em> e crie o usuário{' '}
                        <strong>{demoHint.email}</strong> em <em>Users</em>.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        <a
                          href={`https://console.firebase.google.com/project/${encodeURIComponent(FIREBASE_PROJECT_ID)}/authentication/providers`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-800"
                        >
                          Ativar E-mail/Senha <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={`https://console.firebase.google.com/project/${encodeURIComponent(FIREBASE_PROJECT_ID)}/authentication/users`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 hover:bg-red-100"
                        >
                          Gerenciar Usuários <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submittingLogin}
                className="da-btn-3d w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold disabled:opacity-60 cursor-pointer"
              >
                <Lock className="h-4 w-4 text-[#E6AE52]" />
                {submittingLogin ? 'Entrando...' : 'Entrar no Painel'}
              </button>

              <div className="rounded-2xl border border-[#781B68]/20 bg-[#FFF5EB]/70 p-3.5 text-xs text-[#310D2B] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold uppercase tracking-wider text-[11px] text-[#781B68]">
                    Acesso Demo
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail(demoHint.email);
                      if (demoHint.enabled && demoHint.password) {
                        setLoginPassword(demoHint.password);
                      }
                    }}
                    className="rounded-lg border border-[#781B68]/25 bg-white px-2.5 py-1 text-[11px] font-bold text-[#4A123F] hover:bg-[#781B68]/10 cursor-pointer"
                  >
                    {demoHint.enabled && demoHint.password ? 'Preencher demo' : 'Preencher e-mail'}
                  </button>
                </div>

                <div className="space-y-1 font-mono-tabular text-[12px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[#5C4952]">E-mail:</span>
                    <span className="font-bold text-[#310D2B] select-all">{demoHint.email}</span>
                  </div>
                  {demoHint.enabled && demoHint.password ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[#5C4952]">Senha:</span>
                      <span className="font-bold text-[#310D2B] select-all">{demoHint.password}</span>
                    </div>
                  ) : (
                    <p className="font-sans text-[11px] leading-relaxed text-[#5C4952]">
                      Utilize a senha administrativa definida no Firebase Authentication (ou configure a exibição da senha demo nas variáveis de ambiente).
                    </p>
                  )}
                </div>
              </div>
            </form>
          )}

          <button
            type="button"
            onClick={onBackToStore}
            className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-2xl border border-[#781B68]/20 py-2.5 text-xs font-semibold text-[#4A123F] hover:bg-[#FFF5EB] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para a loja pública
          </button>
        </div>
      </div>
    );
  }

  const newOrdersCount = orders.filter((o) => o.status === 'received').length;
  const pendingReviewsCount = reviews.filter((r) => r.status === 'pending').length;
  const unreadChatsCount = conversations.filter((c) => c.unreadAdmin).length;

  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Pedidos', icon: ClipboardList, badge: newOrdersCount },
    { id: 'products', label: 'Produtos', icon: IceCream },
    { id: 'categories', label: 'Categorias', icon: FolderTree },
    { id: 'addons', label: 'Adicionais', icon: PlusCircle },
    { id: 'reviews', label: 'Avaliações', icon: Star, badge: pendingReviewsCount },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'finance', label: 'Financeiro', icon: CreditCard },
    { id: 'expenses', label: 'Despesas', icon: Receipt },
    { id: 'coupons', label: 'Cupons', icon: Ticket },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'chat', label: 'Chat e suporte', icon: MessageSquare, badge: unreadChatsCount },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const handleRequestNotifications = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  return (
    <div className="min-h-screen flex bg-[#FFF5EB] text-[#1A1216]">
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex w-64 flex-col border-r border-[#781B68]/20 text-white shrink-0 no-print"
        style={{
          background: 'linear-gradient(180deg, #310D2B 0%, #4A123F 68%, #5D1550 100%)',
        }}
      >
        <div className="flex items-center gap-3 border-b border-white/12 px-5 py-4">
          <img
            src={settings.logoUrl || '/assets/aistudio/image_332d0e8c.png'}
            alt={settings.storeName}
            className="h-10 w-10 rounded-full ring-2 ring-[#E6AE52]/55 bg-white object-cover"
          />
          <div className="min-w-0">
            <div className="font-display text-base font-bold truncate text-white">{settings.storeName}</div>
            <div className="text-[11px] text-[#FBE6C2]/80 truncate">{user.email}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#E6AE52] to-[#D4932E] text-[#310D2B] shadow-[0_6px_16px_-6px_rgba(230,174,82,0.5)]'
                    : 'text-[#FFF5EB]/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`font-mono-tabular rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold ${
                      active ? 'bg-[#310D2B] text-[#E6AE52]' : 'bg-[#781B68] text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/12 p-3 space-y-1.5">
          <button
            type="button"
            onClick={onBackToStore}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#FFF5EB]/90 hover:bg-white/10 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-[#E6AE52]" />
            Ver loja pública
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden bg-black/50 no-print">
          <div className="w-72 bg-white h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3.5">
              <span className="font-display text-lg font-bold">{settings.storeName}</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold ${
                      active ? 'bg-[#4A1230] text-white' : 'text-[#3D2E35] hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="font-mono-tabular text-[11px] font-bold">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-neutral-200 p-3 space-y-1.5">
              <button
                type="button"
                onClick={onBackToStore}
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#3D2E35]"
              >
                <ArrowLeft className="h-4 w-4" />
                Ver loja pública
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-red-700"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-4 border-b border-[#781B68]/12 bg-white/95 backdrop-blur-md px-4 py-3 sm:px-6 no-print">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-xl p-2 text-[#310D2B] hover:bg-[#FFF5EB]"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-sm font-semibold text-[#5C4952]">
              Administração /{' '}
              <span className="font-bold text-[#4A123F]">
                {navItems.find((n) => n.id === activeTab)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {'Notification' in window && Notification.permission === 'default' && (
              <button
                type="button"
                onClick={handleRequestNotifications}
                className="da-btn-3d rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer"
              >
                Ativar alertas no dispositivo
              </button>
            )}
          </div>
        </header>

        {newOrderToast && (
          <div className="mx-4 mt-4 sm:mx-6 rounded-2xl bg-gradient-to-r from-[#4A123F] to-[#781B68] px-4 py-3 text-sm font-semibold text-white flex items-center justify-between shadow-md no-print">
            <span>{newOrderToast}</span>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="da-btn-gold rounded-xl px-3 py-1 text-xs font-bold cursor-pointer"
            >
              Abrir Pedidos
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <AdminDashboard orders={orders} payments={payments} products={products} />
          )}
          {activeTab === 'orders' && (
            <AdminOrders
              orders={orders}
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((s) => !s)}
            />
          )}
          {activeTab === 'products' && (
            <AdminProducts products={products} categories={categories} />
          )}
          {activeTab === 'categories' && <AdminCategories categories={categories} />}
          {activeTab === 'addons' && <AdminAddons addons={addons} />}
          {activeTab === 'reviews' && <AdminReviews reviews={reviews} />}
          {activeTab === 'customers' && <AdminCustomers orders={orders} />}
          {activeTab === 'finance' && (
            <AdminFinance orders={orders} payments={payments} expenses={expenses} />
          )}
          {activeTab === 'expenses' && <AdminExpenses expenses={expenses} />}
          {activeTab === 'coupons' && <AdminCoupons coupons={coupons} />}
          {activeTab === 'reports' && (
            <AdminReports orders={orders} expenses={expenses} payments={payments} />
          )}
          {activeTab === 'chat' && <AdminChat conversations={conversations} orders={orders} />}
          {activeTab === 'settings' && <AdminSettings settings={settings} />}
        </main>
      </div>
    </div>
  );
};

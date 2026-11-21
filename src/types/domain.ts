export type OrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type OrderModality = 'delivery' | 'pickup';
export type PaymentMethod = 'pix' | 'cash' | 'card';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type AddonGroup = 'cremes' | 'frutas' | 'caldas' | 'crocantes' | 'especiais';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface NeighborhoodFee {
  neighborhood: string;
  fee: number;
}

export interface StoreSettings {
  storeName: string;
  description: string;
  logoUrl: string;
  faviconUrl?: string;
  bannerUrl: string;
  promoBannerTitle?: string;
  promoBannerSubtitle?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  phone: string;
  whatsapp: string;
  address: string;
  cnpj?: string;
  openingHours: string;
  openingDays: string;
  isOpen: boolean;
  pauseOrders: boolean;
  closedMessage?: string;
  deliveryFeeFixed: number;
  minOrderValue: number;
  estimatedDeliveryMinutes: number;
  neighborhoodFees: NeighborhoodFee[];
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pixEnabled: boolean;
  cashEnabled: boolean;
  cardEnabled: boolean;
  pixKey?: string;
  pixReceiverName?: string;
  requireReviewModeration?: boolean;
  updatedAt?: unknown;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  price: number;
  promoPrice?: number | null;
  imageUrl: string;
  available: boolean;
  archived: boolean;
  featured: boolean;
  bestSeller: boolean;
  isNew: boolean;
  allowAddons: boolean;
  sizes: ProductOption[];
  bases: ProductOption[];
  ratingAvg: number;
  ratingCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Addon {
  id: string;
  name: string;
  group: AddonGroup;
  price: number;
  available: boolean;
  maxQty: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrderValue: number;
  firstOrderOnly: boolean;
  maxUses: number;
  usedCount: number;
  expiresAt?: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SelectedAddon {
  addonId: string;
  name: string;
  price: number;
  qty: number;
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  productName: string;
  imageUrl: string;
  unitBasePrice: number;
  size: ProductOption | null;
  base: ProductOption | null;
  addons: SelectedAddon[];
  quantity: number;
  notes: string;
  lineTotal: number;
}

export interface OrderItemRecord {
  productId: string;
  productName: string;
  sizeName: string;
  baseName: string;
  addons: SelectedAddon[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  trackingId: string;
  customerUid?: string | null;
  customerName: string;
  customerPhone: string;
  modality: OrderModality;
  cep?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  reference?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  changeFor?: number | null;
  status: OrderStatus;
  cancelReason?: string;
  couponCode?: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  paymentFee: number;
  total: number;
  items: OrderItemRecord[];
  notes?: string;
  priceDigest?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderTracking {
  id: string;
  orderId: string;
  orderNumber: string;
  modality: OrderModality;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cancelReason?: string;
  total: number;
  estimatedMinutes: number;
  itemsSummary: Array<{
    productId: string;
    productName: string;
    sizeName: string;
    quantity: number;
    lineTotal: number;
  }>;
  productIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerProfile {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
  role: 'customer';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Review {
  id: string;
  productId: string;
  productName: string;
  orderId: string;
  trackingId: string;
  customerUid?: string | null;
  customerName: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  adminReply: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: 'pix' | 'cash' | 'card' | 'transfer' | 'boleto';
  status: 'paid' | 'pending';
  receiptUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  method: PaymentMethod;
  amount: number;
  feeAmount: number;
  netAmount: number;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  providerRef?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Conversation {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerUid?: string | null;
  orderId?: string;
  orderNumber?: string;
  status: 'open' | 'closed';
  lastMessage: string;
  unreadAdmin: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  senderRole: 'customer' | 'admin';
  senderName: string;
  text: string;
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt?: unknown;
}

export interface LocalTrackedOrderRef {
  orderId: string;
  trackingId: string;
  orderNumber: string;
  createdAtIso: string;
}

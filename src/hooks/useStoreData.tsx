import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_ADDONS,
  DEFAULT_CATEGORIES,
  DEFAULT_COUPONS,
  DEFAULT_PRODUCTS,
  DEFAULT_STORE_SETTINGS,
} from '../lib/defaultCatalog.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { toDate } from '../lib/formatters.ts';
import type { Addon, Category, Order, Product, Review, StoreSettings } from '../types/domain.ts';
import { useAuth } from './useAuth.tsx';

export interface ProductRatingSummary {
  avg: number;
  count: number;
}

interface StoreDataContextValue {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  addons: Addon[];
  approvedReviews: Review[];
  customerOrders: Order[];
  customerReviews: Review[];
  ratingStatsByProduct: Record<string, ProductRatingSummary>;
  loading: boolean;
  isUsingStarterCatalog: boolean;
  seedCatalogIfEmpty: () => Promise<void>;
}

const StoreDataContext = createContext<StoreDataContextValue | null>(null);

export const StoreDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [settingsDoc, setSettingsDoc] = useState<StoreSettings | null>(null);
  const [categoriesDocs, setCategoriesDocs] = useState<Category[]>([]);
  const [productsDocs, setProductsDocs] = useState<Product[]>([]);
  const [addonsDocs, setAddonsDocs] = useState<Addon[]>([]);
  const [approvedReviews, setApprovedReviews] = useState<Review[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [customerReviews, setCustomerReviews] = useState<Review[]>([]);
  const [loadedFlags, setLoadedFlags] = useState({
    settings: false,
    categories: false,
    products: false,
    addons: false,
  });

  useEffect(() => {
    const unsubSettings = onSnapshot(
      doc(db, 'storeSettings', 'main'),
      (snap) => {
        setSettingsDoc(snap.exists() ? (snap.data() as StoreSettings) : null);
        setLoadedFlags((prev) => ({ ...prev, settings: true }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'storeSettings/main');
      }
    );

    const unsubCategories = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Category), id: d.id }))
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setCategoriesDocs(list);
        setLoadedFlags((prev) => ({ ...prev, categories: true }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'categories');
      }
    );

    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Product), id: d.id }));
        setProductsDocs(list);
        setLoadedFlags((prev) => ({ ...prev, products: true }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    );

    const unsubAddons = onSnapshot(
      collection(db, 'addons'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Addon), id: d.id }));
        setAddonsDocs(list);
        setLoadedFlags((prev) => ({ ...prev, addons: true }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'addons');
      }
    );

    const reviewsQuery = query(collection(db, 'reviews'), where('status', '==', 'approved'));
    const unsubReviews = onSnapshot(
      reviewsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Review), id: d.id }))
          .sort(
            (a, b) =>
              (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
          );
        setApprovedReviews(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'reviews');
      }
    );

    return () => {
      unsubSettings();
      unsubCategories();
      unsubProducts();
      unsubAddons();
      unsubReviews();
    };
  }, []);

  // Subscribe to registered customer's own orders and submitted reviews
  useEffect(() => {
    if (!user || !user.emailVerified) {
      setCustomerOrders([]);
      setCustomerReviews([]);
      return;
    }

    const ordersQuery = query(collection(db, 'orders'), where('customerUid', '==', user.uid));
    const unsubCustomerOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Order), id: d.id }))
          .sort(
            (a, b) =>
              (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
          );
        setCustomerOrders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );

    const myReviewsQuery = query(collection(db, 'reviews'), where('customerUid', '==', user.uid));
    const unsubCustomerReviews = onSnapshot(
      myReviewsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Review), id: d.id }))
          .sort(
            (a, b) =>
              (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
          );
        setCustomerReviews(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'reviews');
      }
    );

    return () => {
      unsubCustomerOrders();
      unsubCustomerReviews();
    };
  }, [user]);

  const settings = settingsDoc || DEFAULT_STORE_SETTINGS;
  const isUsingStarterCatalog =
    loadedFlags.products && productsDocs.length === 0 && categoriesDocs.length === 0;

  const categories = useMemo(
    () => (isUsingStarterCatalog ? DEFAULT_CATEGORIES : categoriesDocs),
    [isUsingStarterCatalog, categoriesDocs]
  );

  const products = useMemo(
    () => (isUsingStarterCatalog ? DEFAULT_PRODUCTS : productsDocs),
    [isUsingStarterCatalog, productsDocs]
  );

  const addons = useMemo(
    () => (isUsingStarterCatalog && addonsDocs.length === 0 ? DEFAULT_ADDONS : addonsDocs),
    [isUsingStarterCatalog, addonsDocs]
  );

  const ratingStatsByProduct = useMemo(() => {
    const grouped: Record<string, { sum: number; count: number }> = {};
    for (const rev of approvedReviews) {
      if (!grouped[rev.productId]) grouped[rev.productId] = { sum: 0, count: 0 };
      grouped[rev.productId].sum += rev.rating;
      grouped[rev.productId].count += 1;
    }

    const stats: Record<string, ProductRatingSummary> = {};
    for (const prod of products) {
      const live = grouped[prod.id];
      if (live && live.count > 0) {
        stats[prod.id] = {
          avg: Number((live.sum / live.count).toFixed(1)),
          count: live.count,
        };
      } else {
        stats[prod.id] = {
          avg: Number((prod.ratingAvg || 0).toFixed(1)),
          count: prod.ratingCount || 0,
        };
      }
    }
    return stats;
  }, [approvedReviews, products]);

  // Sync brand CSS variables, page title & favicon dynamically from StoreSettings
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', settings.primaryColor || '#4A123F');
    root.style.setProperty('--brand-secondary', settings.secondaryColor || '#781B68');
    root.style.setProperty('--brand-accent', settings.accentColor || '#E6AE52');

    document.title = `${settings.storeName || 'Dois Amores'} | Açaíteria e Sorveteria`;

    if (settings.faviconUrl) {
      const iconEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (iconEl) iconEl.href = settings.faviconUrl;
    }
  }, [settings]);

  const seedCatalogIfEmpty = async () => {
    try {
      const existingProducts = await getDocs(collection(db, 'products'));
      const settingsSnap = await getDoc(doc(db, 'storeSettings', 'main'));

      const batch = writeBatch(db);
      let hasWrites = false;

      if (!settingsSnap.exists()) {
        batch.set(doc(db, 'storeSettings', 'main'), {
          ...DEFAULT_STORE_SETTINGS,
          updatedAt: serverTimestamp(),
        });
        hasWrites = true;
      }

      if (existingProducts.empty) {
        for (const cat of DEFAULT_CATEGORIES) {
          const { id: _catId, ...catPayload } = cat;
          void _catId;
          batch.set(doc(db, 'categories', cat.id), {
            ...catPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        for (const prod of DEFAULT_PRODUCTS) {
          const { id: _prodId, ...prodPayload } = prod;
          void _prodId;
          batch.set(doc(db, 'products', prod.id), {
            ...prodPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        for (const addon of DEFAULT_ADDONS) {
          const { id: _addonId, ...addonPayload } = addon;
          void _addonId;
          batch.set(doc(db, 'addons', addon.id), {
            ...addonPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        for (const coupon of DEFAULT_COUPONS) {
          const { id: _couponId, ...couponPayload } = coupon;
          void _couponId;
          batch.set(doc(db, 'coupons', coupon.code), {
            ...couponPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        hasWrites = true;
      }

      if (hasWrites) {
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'storeSettings/main');
    }
  };

  const loading =
    !loadedFlags.settings || !loadedFlags.categories || !loadedFlags.products || !loadedFlags.addons;

  return (
    <StoreDataContext.Provider
      value={{
        settings,
        categories,
        products,
        addons,
        approvedReviews,
        customerOrders,
        customerReviews,
        ratingStatsByProduct,
        loading,
        isUsingStarterCatalog,
        seedCatalogIfEmpty,
      }}
    >
      {children}
    </StoreDataContext.Provider>
  );
};

export function useStoreData() {
  const ctx = useContext(StoreDataContext);
  if (!ctx) throw new Error('useStoreData deve ser usado dentro de StoreDataProvider.');
  return ctx;
}

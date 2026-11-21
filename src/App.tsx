import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { AdminPanel } from './components/admin/AdminPanel.tsx';
import { StorefrontPage } from './components/store/StorefrontPage.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { StoreDataProvider } from './hooks/useStoreData.tsx';

export type AppRoute = 'store' | 'catalog' | 'admin';

function resolveRoute(): AppRoute {
  const path = window.location.pathname;
  const hash = window.location.hash;
  if (path.startsWith('/admin') || hash.startsWith('#/admin')) return 'admin';
  if (path.startsWith('/cardapio') || hash.startsWith('#/cardapio')) return 'catalog';
  return 'store';
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute());
  const [catalogCategoryHint, setCatalogCategoryHint] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('cat') || 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    const handlePop = () => {
      setRoute(resolveRoute());
      try {
        const params = new URLSearchParams(window.location.search);
        setCatalogCategoryHint(params.get('cat') || 'all');
      } catch {
        setCatalogCategoryHint('all');
      }
    };
    window.addEventListener('popstate', handlePop);
    window.addEventListener('hashchange', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
      window.removeEventListener('hashchange', handlePop);
    };
  }, []);

  const navigateTo = (target: AppRoute, categoryId?: string) => {
    let nextPath = '/';
    if (target === 'admin') {
      nextPath = '/admin';
    } else if (target === 'catalog') {
      const cat = categoryId && categoryId !== 'all' ? `?cat=${encodeURIComponent(categoryId)}` : '';
      nextPath = `/cardapio${cat}`;
      setCatalogCategoryHint(categoryId || 'all');
    } else {
      setCatalogCategoryHint('all');
    }

    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setRoute(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <StoreDataProvider>
            {route === 'admin' ? (
              <AdminPanel onBackToStore={() => navigateTo('store')} />
            ) : (
              <StorefrontPage
                activePage={route === 'catalog' ? 'catalog' : 'home'}
                catalogCategoryHint={catalogCategoryHint}
                onNavigateHome={() => navigateTo('store')}
                onNavigateCatalog={(categoryId) => navigateTo('catalog', categoryId)}
                onOpenAdmin={() => navigateTo('admin')}
              />
            )}
            <OfflineIndicator />
          </StoreDataProvider>
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

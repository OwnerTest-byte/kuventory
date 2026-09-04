import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RequireAuth, RequireAdmin } from '@/features/auth/components/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { InventoryLandingPage } from '@/features/inventory/pages/InventoryLandingPage';
import { Loader2 } from 'lucide-react';

import { useRealtimeSync } from '@/features/inventory/hooks/useRealtimeSync';

// Code Splitting for heavy or secondary routes
const DailyInventoryPage = lazy(() => import('@/features/daily-inventory/pages/DailyInventoryPage').then(module => ({ default: module.DailyInventoryPage })));
const ItemsCatalogPage = lazy(() => import('@/features/inventory/pages/ItemsCatalogPage').then(module => ({ default: module.ItemsCatalogPage })));
const ItemDetailsPage = lazy(() => import('@/features/inventory/pages/ItemDetailsPage').then(module => ({ default: module.ItemDetailsPage })));
const ReportViewPage = lazy(() => import('@/features/reports/pages/ReportViewPage').then(module => ({ default: module.ReportViewPage })));
const ReportsLibraryPage = lazy(() => import('@/features/reports/pages/ReportsLibraryPage').then(module => ({ default: module.ReportsLibraryPage })));
const CategoriesPage = lazy(() => import('@/features/categories/pages/CategoriesPage').then(module => ({ default: module.CategoriesPage })));
const AdminPage = lazy(() => import('@/features/admin/pages/AdminPage').then(module => ({ default: module.AdminPage })));
const NotificationCenter = lazy(() => import('@/features/inventory/pages/NotificationCenter').then(module => ({ default: module.NotificationCenter })));

const StockBatchesPage = lazy(() => import('@/features/inventory/pages/StockBatchesPage').then(module => ({ default: module.StockBatchesPage })));
const StockHistoryPage = lazy(() => import('@/features/inventory/pages/StockHistoryPage').then(module => ({ default: module.StockHistoryPage })));

const FallbackLoader = () => (
  <div className="flex h-full w-full items-center justify-center p-8">
    <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
  </div>
);

export function App() {
  useRealtimeSync();

  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes (USER + ADMIN) */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/inventory" element={<InventoryLandingPage />} />
            
            <Route path="/daily-inventory" element={
              <Suspense fallback={<FallbackLoader />}><DailyInventoryPage /></Suspense>
            } />
            <Route path="/reports" element={
              <Suspense fallback={<FallbackLoader />}><ReportsLibraryPage /></Suspense>
            } />
            <Route path="/reports/:id" element={
              <Suspense fallback={<FallbackLoader />}><ReportViewPage /></Suspense>
            } />
            <Route path="/reports/inventory" element={<Suspense fallback={<FallbackLoader />}><ReportsLibraryPage /></Suspense>} />
            <Route path="/reports/movement" element={<Suspense fallback={<FallbackLoader />}><ReportsLibraryPage /></Suspense>} />
            <Route path="/reports/low-stock" element={<Suspense fallback={<FallbackLoader />}><ReportsLibraryPage /></Suspense>} />
            <Route path="/reports/expiry" element={<Suspense fallback={<FallbackLoader />}><ReportsLibraryPage /></Suspense>} />
            <Route path="/reports/archived" element={<Suspense fallback={<FallbackLoader />}><ReportsLibraryPage /></Suspense>} />

            <Route path="/notifications" element={
              <Suspense fallback={<FallbackLoader />}><NotificationCenter /></Suspense>
            } />
            
            <Route path="/items" element={
              <Suspense fallback={<FallbackLoader />}><ItemsCatalogPage /></Suspense>
            } />
            <Route path="/items/:id" element={
              <Suspense fallback={<FallbackLoader />}><ItemDetailsPage /></Suspense>
            } />
            
            <Route path="/categories" element={
              <Suspense fallback={<FallbackLoader />}><CategoriesPage /></Suspense>
            } />
            <Route path="/stock" element={<Suspense fallback={<FallbackLoader />}><StockBatchesPage /></Suspense>} />
            <Route path="/history" element={<Suspense fallback={<FallbackLoader />}><StockHistoryPage /></Suspense>} />
            
            {/* Admin-only Routes */}
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={
                <Suspense fallback={<FallbackLoader />}><AdminPage /></Suspense>
              } />
              <Route path="/settings" element={
                <Suspense fallback={<FallbackLoader />}><AdminPage /></Suspense>
              } />
            </Route>

            {/* Fallback for authenticated users */}
            <Route path="*" element={<Navigate to="/inventory" replace />} />
          </Route>
        </Route>

        {/* Global Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

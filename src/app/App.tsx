import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RequireAuth } from '@/features/auth/components/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { InventoryLandingPage } from '@/features/inventory/pages/InventoryLandingPage';
import { Loader2 } from 'lucide-react';

import { useRealtimeSync } from '@/features/inventory/hooks/useRealtimeSync';
import { initKeepaliveHeartbeat } from '@/lib/keepalive';

// Code Splitting for heavy or secondary routes
const DailyInventoryPage = lazy(() => import('@/features/daily-inventory/pages/DailyInventoryPage').then(module => ({ default: module.DailyInventoryPage })));
const ItemsCatalogPage = lazy(() => import('@/features/inventory/pages/ItemsCatalogPage').then(module => ({ default: module.ItemsCatalogPage })));
const ItemDetailsPage = lazy(() => import('@/features/inventory/pages/ItemDetailsPage').then(module => ({ default: module.ItemDetailsPage })));
const ReportViewPage = lazy(() => import('@/features/reports/pages/ReportViewPage').then(module => ({ default: module.ReportViewPage })));
const ReportsLibraryPage = lazy(() => import('@/features/reports/pages/ReportsLibraryPage').then(module => ({ default: module.ReportsLibraryPage })));
const AdminPage = lazy(() => import('@/features/admin/pages/AdminPage').then(module => ({ default: module.AdminPage })));
const NotificationCenter = lazy(() => import('@/features/inventory/pages/NotificationCenter').then(module => ({ default: module.NotificationCenter })));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage').then(module => ({ default: module.ResetPasswordPage })));

const FallbackLoader = () => (
  <div className="flex h-full w-full items-center justify-center p-8">
    <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
  </div>
);

export function App() {
  useRealtimeSync();

  // Automatic background keepalive to protect Supabase free tier from 7-day pause
  initKeepaliveHeartbeat();

  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={
          <Suspense fallback={<FallbackLoader />}><ResetPasswordPage /></Suspense>
        } />

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
            
            <Route path="/categories" element={<Navigate to="/items?tab=categories" replace />} />
            <Route path="/stock" element={<Navigate to="/items?tab=batches" replace />} />
            <Route path="/history" element={<Navigate to="/items?tab=history" replace />} />
            
            {/* Unified Settings & Administration (Adaptive role-based views for Staff and Admins) */}
            <Route path="/settings" element={
              <Suspense fallback={<FallbackLoader />}><AdminPage /></Suspense>
            } />
            <Route path="/admin" element={<Navigate to="/settings" replace />} />

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

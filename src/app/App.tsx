import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RequireAuth, RequireAdmin } from '@/features/auth/components/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';

// Placeholder Pages
const Dashboard = () => (
  <div>
    <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
    <p>Welcome to Kuventory. Select an option from the sidebar.</p>
  </div>
);

import { InventoryTestBed } from '@/features/inventory/components/InventoryTestBed';

const AdminPanel = () => (
  <div>
    <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
    <p>Protected area. Only ADMIN roles can see this.</p>
  </div>
);

export function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes (USER + ADMIN) */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inventory" element={<InventoryTestBed />} />
            
            {/* Admin-only Routes */}
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminPanel />} />
            </Route>

            {/* Fallback for authenticated users */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>

        {/* Global Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

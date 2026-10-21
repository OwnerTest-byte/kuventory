import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { App } from './app/App.tsx';
import { supabase } from './lib/supabase';
import './index.css';

if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30s freshness window for general reference/catalog data
      gcTime: 10 * 60 * 1000, // 10 minutes cache retention
      refetchOnWindowFocus: false, // Prevent aggressive refetch bursts when switching tabs
      retry: 1, // Single retry on transient network failures
    },
    mutations: {
      retry: 0, // Never auto-retry stock mutations
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Register PWA Service Worker in production
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}


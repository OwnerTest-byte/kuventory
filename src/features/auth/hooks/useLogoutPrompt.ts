import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { releaseSessionLease } from '../services/sessionLeaseService';

export function useLogoutPrompt() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const promptLogout = useCallback((unsaved = false) => {
    setHasUnsavedChanges(unsaved);
    setIsModalOpen(true);
  }, []);

  const cancelLogout = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const confirmLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await releaseSessionLease();
    } catch (e) {
      console.warn('Error releasing session lease during logout:', e);
    }

    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Error signing out:', e);
    } finally {
      sessionStorage.removeItem('kuventory_browser_session_active');
      queryClient.clear();
      setIsLoggingOut(false);
      setIsModalOpen(false);
      navigate('/login', { replace: true });
    }
  }, [navigate, queryClient]);

  return {
    isModalOpen,
    hasUnsavedChanges,
    isLoggingOut,
    promptLogout,
    cancelLogout,
    confirmLogout,
  };
}

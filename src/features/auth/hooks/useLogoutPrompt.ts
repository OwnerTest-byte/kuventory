import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { releaseSessionLease } from '../services/sessionLeaseService';

export function useLogoutPrompt() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

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
      setIsLoggingOut(false);
      setIsModalOpen(false);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return {
    isModalOpen,
    hasUnsavedChanges,
    isLoggingOut,
    promptLogout,
    cancelLogout,
    confirmLogout,
  };
}

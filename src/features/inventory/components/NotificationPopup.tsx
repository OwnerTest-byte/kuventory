import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  KeyRound, 
  ShieldAlert, 
  Info, 
  X, 
  ArrowRight
} from 'lucide-react';
import { useNotifications, useMarkNotificationAsRead } from '../hooks/useNotifications';
import { getNotificationRoute } from '../utils/notificationRouter';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '../types';
import { cn } from '@/lib/utils';

interface ActiveToast {
  notification: AppNotification;
  timerId?: any;
}

const SEEN_NOTIFICATIONS_KEY = 'kuventory_popup_seen_notif_ids';

function getSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_NOTIFICATIONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markSeenId(id: string) {
  try {
    const seen = getSeenIds();
    seen.add(id);
    // Keep set bounded to last 100
    const arr = Array.from(seen).slice(-100);
    sessionStorage.setItem(SEEN_NOTIFICATIONS_KEY, JSON.stringify(arr));
  } catch {}
}

export function NotificationPopup() {
  const navigate = useNavigate();
  const [activeToasts, setActiveToasts] = useState<ActiveToast[]>([]);
  const { data: notifications = [] } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const activeToastsRef = useRef<ActiveToast[]>([]);
  activeToastsRef.current = activeToasts;

  const dismissToast = useCallback((id: string) => {
    setActiveToasts(prev => {
      const target = prev.find(t => t.notification.id === id);
      if (target?.timerId) clearTimeout(target.timerId);
      return prev.filter(t => t.notification.id !== id);
    });
  }, []);

  const showNotificationToast = useCallback((notif: AppNotification) => {
    if (!notif || notif.is_read) return;

    markSeenId(notif.id);

    // Prevent duplicate entries
    if (activeToastsRef.current.some(t => t.notification.id === notif.id)) {
      return;
    }

    const timerId = setTimeout(() => {
      dismissToast(notif.id);
    }, 7000);

    const newToast: ActiveToast = {
      notification: notif,
      timerId,
    };

    setActiveToasts(prev => [newToast, ...prev.slice(0, 2)]);
  }, [dismissToast]);

  // 1. Initial check for unread alerts that have not yet been seen in this session
  useEffect(() => {
    if (notifications.length === 0) return;
    const seen = getSeenIds();
    const unread = notifications.filter(n => !n.is_read && !seen.has(n.id));
    if (unread.length > 0) {
      // Show the most recent unread alert
      showNotificationToast(unread[0]);
    }
  }, [notifications, showNotificationToast]);

  // 2. Real-time Supabase subscription for instant 0ms pop-up arrival
  useEffect(() => {
    const channelName = `popup-listener-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          if (newNotif && !newNotif.is_read) {
            showNotificationToast(newNotif);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showNotificationToast]);

  const handleCardClick = (notif: AppNotification) => {
    // 1. Dismiss this toast
    dismissToast(notif.id);

    // 2. Mark as read
    if (!notif.is_read) {
      markAsRead.mutate(notif.id);
    }

    // 3. 1-Click Redirect to the exact notification route
    const destination = getNotificationRoute(notif);
    navigate(destination);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'LOW_STOCK': 
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
      case 'OUT_OF_STOCK': 
        return <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />;
      case 'EXPIRING_SOON': 
        return <Clock className="w-5 h-5 text-amber-500 shrink-0" />;
      case 'EXPIRED': 
        return <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />;
      case 'PASSWORD_RESET': 
        return <KeyRound className="w-5 h-5 text-amber-500 shrink-0 animate-pulse" />;
      case 'SYSTEM': 
        return <ShieldAlert className="w-5 h-5 text-blue-500 shrink-0" />;
      default: 
        return <Info className="w-5 h-5 text-primary shrink-0" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'OUT_OF_STOCK':
      case 'EXPIRED':
        return 'border-rose-500/40 hover:border-rose-500';
      case 'LOW_STOCK':
      case 'EXPIRING_SOON':
      case 'PASSWORD_RESET':
        return 'border-amber-500/40 hover:border-amber-500';
      default:
        return 'border-primary/40 hover:border-primary';
    }
  };

  const getBadgeText = (type: string) => {
    switch (type) {
      case 'LOW_STOCK': return 'Low Stock Warning';
      case 'OUT_OF_STOCK': return 'Out of Stock Alert';
      case 'EXPIRING_SOON': return 'Expiry Warning';
      case 'EXPIRED': return 'Batch Expired';
      case 'PASSWORD_RESET': return 'Password Reset Request';
      case 'SYSTEM': return 'System Alert';
      default: return 'Notification';
    }
  };

  if (activeToasts.length === 0) return null;

  return (
    <div 
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] sm:w-auto pointer-events-none"
    >
      {activeToasts.map(({ notification }) => (
        <div
          key={notification.id}
          role="alert"
          onClick={() => handleCardClick(notification)}
          className={cn(
            "pointer-events-auto cursor-pointer group relative overflow-hidden rounded-xl border bg-card/95 text-card-foreground backdrop-blur-md p-4 shadow-xl transition-all duration-200 hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]",
            getBorderColor(notification.type)
          )}
        >
          {/* Subtle Top Accent Glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary via-[#C5A059] to-primary/80" />

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-muted/80 border border-border mt-0.5">
              {getIcon(notification.type)}
            </div>

            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground font-mono">
                  {getBadgeText(notification.type)}
                </span>
                <span className="text-[10px] text-muted-foreground/80">• Just now</span>
              </div>

              <h4 className="text-sm font-bold text-foreground leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                {notification.title || 'System Notification'}
              </h4>

              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                {notification.message}
              </p>

              <div className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-primary group-hover:underline">
                <span>View details</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>

            {/* Dismiss Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(notification.id);
              }}
              className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

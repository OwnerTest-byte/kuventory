import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Info, Clock, AlertCircle, CheckCheck, Loader2, RefreshCw, BellOff } from 'lucide-react';
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead } from '../hooks/useNotifications';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AppNotification } from '../types';

function getIcon(type: string) {
  switch (type) {
    case 'LOW_STOCK': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'OUT_OF_STOCK': return <AlertCircle className="h-5 w-5 text-red-500" />;
    case 'EXPIRING_SOON': return <Clock className="h-5 w-5 text-amber-500" />;
    case 'EXPIRED': return <AlertCircle className="h-5 w-5 text-red-500" />;
    default: return <Info className="h-5 w-5 text-blue-500" />;
  }
}

function getBadgeVariant(type: string) {
  switch (type) {
    case 'LOW_STOCK': return 'outline' as const;
    case 'OUT_OF_STOCK': return 'destructive' as const;
    case 'EXPIRING_SOON': return 'outline' as const;
    case 'EXPIRED': return 'destructive' as const;
    default: return 'default' as const;
  }
}

function typeLabel(type: string) {
  switch (type) {
    case 'LOW_STOCK': return 'LOW STOCK';
    case 'OUT_OF_STOCK': return 'OUT OF STOCK';
    case 'EXPIRING_SOON': return 'EXPIRING SOON';
    case 'EXPIRED': return 'EXPIRED';
    default: return type;
  }
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading, isError, refetch } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-page-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .subscribe();
    subRef.current = channel;
    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [queryClient]);

  const handleOpen = (n: AppNotification) => {
    if (!n.is_read) markAsRead.mutate(n.id);
    if (n.type === 'LOW_STOCK' || n.type === 'OUT_OF_STOCK' || n.type === 'EXPIRING_SOON' || n.type === 'EXPIRED') {
      navigate('/stock');
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-8 h-8 text-blue-500" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-950">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Notifications</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Stock alerts and system notifications.</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="inline-flex items-center justify-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md h-9 px-3 disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4 mr-1" /> Mark all read
          </button>
        )}
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <span className="text-sm">Loading notifications...</span>
        </div>
      ) : isError ? (
        <div className="p-8 text-center">
          <div className="text-red-600 dark:text-red-400 mb-3">Unable to load notifications.</div>
          <button onClick={() => refetch()} className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline">
            <RefreshCw className="w-4 h-4 mr-1" /> Try Again
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-slate-500">
          <BellOff className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No notifications.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleOpen(n)}
                  className={cn(
                    "w-full text-left p-4 flex gap-3 items-start transition-colors",
                    n.is_read ? "opacity-70 hover:bg-slate-50 dark:hover:bg-slate-800/40" : "bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">{getIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm", n.is_read ? "text-slate-700 dark:text-slate-300" : "font-semibold text-slate-900 dark:text-white")}>
                        {n.title}
                      </p>
                      <Badge variant={getBadgeVariant(n.type)}>{typeLabel(n.type)}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{n.message}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

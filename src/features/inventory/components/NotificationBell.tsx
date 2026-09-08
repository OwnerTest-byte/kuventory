import { useState, useRef, useEffect } from 'react';
import { Bell, Check, AlertTriangle, Info, Clock, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead } from '../hooks/useNotifications';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Props {
  placement?: 'bottom-right' | 'top-left';
}

export function NotificationBell({ placement = 'bottom-right' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    // Click outside to close
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Subscribe to realtime notifications
    // Use a unique channel name to avoid StrictMode issues where channel is reused
    const channel = supabase
      .channel(`notifications-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          // Refetch notifications on new insert
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markAsRead.mutate(notification.id);
    }
    setIsOpen(false);
    
    // Navigate based on type
    if (notification.type === 'LOW_STOCK' || notification.type === 'OUT_OF_STOCK') {
      navigate('/reports/low-stock');
    } else if (notification.type === 'EXPIRING_SOON' || notification.type === 'EXPIRED') {
      navigate('/items?tab=batches');
    } else {
      navigate('/items?tab=history');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'LOW_STOCK': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'OUT_OF_STOCK': return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'EXPIRING_SOON': return <Clock className="h-5 w-5 text-amber-500" />;
      case 'EXPIRED': return <AlertCircle className="h-5 w-5 text-red-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button 
        data-testid="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Bell className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-destructive rounded-full border-2 border-background"></span>
        )}
      </button>

      {isOpen && (
        <div 
          className={cn(
            "absolute w-80 sm:w-96 bg-card text-card-foreground border border-border rounded-xl shadow-xl overflow-hidden z-100 flex flex-col max-h-[70vh]",
            placement === 'bottom-right' ? "right-0 top-full mt-2" : "left-0 bottom-full mb-2"
          )}
        >
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="bg-primary/10 text-primary text-xs py-0.5 px-2 rounded-full font-medium">
                  {unreadCount} new
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button 
                onClick={() => markAllAsRead.mutate()}
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                disabled={markAllAsRead.isPending}
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
          
          <div className="overflow-y-auto flex-1 p-2">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg transition-colors flex gap-3 items-start",
                      notification.is_read 
                        ? "opacity-70 hover:bg-muted/40" 
                        : "bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {getIcon(notification.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "text-sm mb-1",
                        notification.is_read 
                          ? "text-foreground/80" 
                          : "font-semibold text-foreground"
                      )}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground/80 mt-2">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-2.5 border-t border-border text-center bg-muted/40">
            <button 
              type="button"
              onClick={() => { setIsOpen(false); navigate('/notifications'); }}
              className="text-xs text-primary hover:text-primary/80 font-bold hover:underline"
            >
              View All in Notification Center →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

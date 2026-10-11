import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  AlertTriangle, 
  Info, 
  Clock, 
  AlertCircle, 
  CheckCheck, 
  Loader2, 
  RefreshCw, 
  BellOff, 
  KeyRound, 
  ShieldAlert, 
  ArrowRight,
  Package
} from 'lucide-react';
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead } from '../hooks/useNotifications';
import { useItems } from '../hooks/useItems';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getNotificationRoute } from '../utils/notificationRouter';
import type { AppNotification, InventoryItem } from '../types';

function getIcon(type: string) {
  switch (type) {
    case 'LOW_STOCK': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'OUT_OF_STOCK': return <AlertCircle className="h-5 w-5 text-red-500" />;
    case 'EXPIRING_SOON': return <Clock className="h-5 w-5 text-amber-500" />;
    case 'EXPIRED': return <AlertCircle className="h-5 w-5 text-red-500" />;
    case 'PASSWORD_RESET': return <KeyRound className="h-5 w-5 text-amber-600" />;
    case 'SYSTEM': return <ShieldAlert className="h-5 w-5 text-primary" />;
    default: return <Info className="h-5 w-5 text-blue-500" />;
  }
}

function getBadgeVariant(type: string) {
  switch (type) {
    case 'LOW_STOCK': return 'outline' as const;
    case 'OUT_OF_STOCK': return 'destructive' as const;
    case 'EXPIRING_SOON': return 'outline' as const;
    case 'EXPIRED': return 'destructive' as const;
    case 'PASSWORD_RESET': return 'secondary' as const;
    default: return 'default' as const;
  }
}

function typeLabel(type: string) {
  switch (type) {
    case 'LOW_STOCK': return 'LOW STOCK';
    case 'OUT_OF_STOCK': return 'OUT OF STOCK';
    case 'EXPIRING_SOON': return 'EXPIRING SOON';
    case 'EXPIRED': return 'EXPIRED';
    case 'PASSWORD_RESET': return 'PASSWORD RESET';
    case 'SYSTEM': return 'SYSTEM ALERT';
    case 'STOCK_DISCREPANCY': return 'DISCREPANCY';
    default: return type;
  }
}

function resolveNotificationMeta(
  n: AppNotification,
  itemMap: Map<string, InventoryItem>,
  items: InventoryItem[]
) {
  let matchedItem = n.item_id ? itemMap.get(n.item_id) : undefined;

  if (!matchedItem && items.length > 0) {
    const combined = `${n.title || ''} ${n.message || ''}`.toLowerCase();
    matchedItem = items.find(
      (item) => item.item_name && item.item_name.length > 1 && combined.includes(item.item_name.toLowerCase())
    );
  }

  let displayTitle = n.title;
  const isGeneric = !displayTitle || /^(alert|notification)\s*\d*$/i.test(displayTitle.trim());

  if (isGeneric) {
    if (matchedItem) {
      switch (n.type) {
        case 'LOW_STOCK': displayTitle = `Low Stock: ${matchedItem.item_name}`; break;
        case 'OUT_OF_STOCK': displayTitle = `Out of Stock: ${matchedItem.item_name}`; break;
        case 'EXPIRING_SOON': displayTitle = `Expiring Soon: ${matchedItem.item_name}`; break;
        case 'EXPIRED': displayTitle = `Expired: ${matchedItem.item_name}`; break;
        case 'STOCK_DISCREPANCY': displayTitle = `Stock Discrepancy: ${matchedItem.item_name}`; break;
        default: displayTitle = `${matchedItem.item_name} Alert`; break;
      }
    } else {
      switch (n.type) {
        case 'LOW_STOCK': displayTitle = 'Low Stock Alert'; break;
        case 'OUT_OF_STOCK': displayTitle = 'Out of Stock Alert'; break;
        case 'EXPIRING_SOON': displayTitle = 'Expiring Batch Alert'; break;
        case 'EXPIRED': displayTitle = 'Expired Batch Alert'; break;
        case 'STOCK_DISCREPANCY': displayTitle = 'Stock Discrepancy Alert'; break;
        case 'PASSWORD_RESET': displayTitle = 'Password Reset Request'; break;
        default: displayTitle = 'System Alert'; break;
      }
    }
  }

  let actionLabel = 'Open';
  if (matchedItem) {
    if (n.type === 'EXPIRING_SOON' || n.type === 'EXPIRED' || n.batch_id) {
      actionLabel = 'View Batches';
    } else {
      actionLabel = 'View Item';
    }
  } else if (n.type === 'STOCK_DISCREPANCY' || n.type === 'DAILY_SHEET') {
    actionLabel = 'Daily Sheet';
  } else if (n.type === 'PASSWORD_RESET') {
    actionLabel = 'User Settings';
  } else if (n.type === 'LOW_STOCK' || n.type === 'OUT_OF_STOCK') {
    actionLabel = 'Low Stock Report';
  }

  return {
    matchedItem,
    displayTitle,
    actionLabel,
  };
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'WARNINGS' | 'CRITICAL'>('ALL');
  const { data: notifications = [], isLoading, isError, refetch } = useNotifications();
  const { items = [] } = useItems();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();

  const itemMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      if (item.id) map.set(item.id, item);
    }
    return map;
  }, [items]);

  const handleOpen = (n: AppNotification) => {
    if (!n.is_read) markAsRead.mutate(n.id);
    const targetUrl = getNotificationRoute(n, items);
    navigate(targetUrl);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'UNREAD') return !n.is_read;
    if (filter === 'WARNINGS') return n.type === 'LOW_STOCK' || n.type === 'EXPIRING_SOON';
    if (filter === 'CRITICAL') return n.type === 'OUT_OF_STOCK' || n.type === 'EXPIRED';
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-8 h-8 text-primary" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Notifications</h1>
          </div>
        </div>
        <button
          onClick={() => markAllAsRead.mutate()}
          disabled={unreadCount === 0 || markAllAsRead.isPending}
          className="inline-flex items-center justify-center text-sm font-medium text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 rounded-md h-9 px-3 disabled:opacity-50 cursor-pointer"
        >
          <CheckCheck className="w-4 h-4 mr-1" /> Mark all as read
        </button>
      </header>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg w-fit border border-border">
        {(['ALL', 'UNREAD', 'WARNINGS', 'CRITICAL'] as const).map((tab) => {
          const label = tab === 'ALL' ? 'All' : tab === 'UNREAD' ? 'Unread' : tab === 'WARNINGS' ? 'Warnings' : 'Critical';
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer",
                filter === tab ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <span className="text-sm">Loading notifications...</span>
        </div>
      ) : isError ? (
        <div className="p-8 text-center">
          <div className="text-destructive mb-3">Unable to load notifications.</div>
          <button onClick={() => refetch()} className="inline-flex items-center text-sm font-medium text-primary hover:underline cursor-pointer">
            <RefreshCw className="w-4 h-4 mr-1" /> Try Again
          </button>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          <BellOff className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notifications found.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <ul className="divide-y divide-border">
            {filteredNotifications.map((n) => {
              const { matchedItem, displayTitle, actionLabel } = resolveNotificationMeta(n, itemMap, items);
              return (
                <li key={n.id}>
                  <button
                    onClick={() => handleOpen(n)}
                    className={cn(
                      "w-full text-left p-4 flex gap-3 items-start transition-colors cursor-pointer group",
                      n.is_read ? "opacity-75 hover:bg-muted/40" : "bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <p className={cn("text-sm", n.is_read ? "text-foreground/80" : "font-semibold text-foreground")}>
                            {displayTitle}
                          </p>
                          {matchedItem && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
                              <Package className="w-3 h-3 text-primary" />
                              {matchedItem.item_name}
                            </span>
                          )}
                        </div>
                        <Badge variant={getBadgeVariant(n.type)} className="shrink-0">{typeLabel(n.type)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                      <div className="flex items-center justify-between mt-2.5 pt-1 border-t border-border/40">
                        <p className="text-[10px] text-muted-foreground/80">
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                        <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:underline">
                          {actionLabel} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

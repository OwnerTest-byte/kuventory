# KUVENTORY Notifications Feature

## Overview

The notification system in KUVENTORY provides automated monitoring and alerts for critical inventory events. In accordance with the project's design principles, notifications are lightweight, persistent, deduplicated, and heavily server-driven.

The notifications strictly focus on the following events:

- **LOW_STOCK**: When an item's aggregate stock falls below its defined `min_quantity` but is greater than 0.
- **OUT_OF_STOCK**: When an item's aggregate stock reaches 0.
- **EXPIRING_SOON**: When a specific batch is within 30 days of its expiry date.
- **EXPIRED**: When a specific batch has reached or passed its expiry date.

## Implementation Architecture

### Database Schema

A `public.notifications` table stores the generated alerts.

```sql
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id), -- NULL implies a system-wide broadcast
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  dedup_key TEXT UNIQUE, -- e.g., 'LOW_STOCK_<item_id>'
  item_id UUID REFERENCES public.inventory_items(id),
  batch_id UUID REFERENCES public.stock_batches(id)
);
```

### Event-Driven Triggers (Thresholds)

We use a PostgreSQL trigger `check_inventory_thresholds()` attached to both `inventory_items` and `stock_batches`.
When stock movements occur, this trigger calculates the aggregate stock for the affected item.

- If stock hits 0, it upserts an `OUT_OF_STOCK` notification using a unique `dedup_key`.
- If stock is low, it upserts a `LOW_STOCK` notification.
- If stock normalizes, it _releases_ the notification by setting `dedup_key = NULL` on previous active warnings, allowing future warnings to trigger normally when stock drops again.

### Scheduled Monitoring (Expiry)

Expiry monitoring cannot rely on stock movement triggers because time passes independently of user actions.
We leverage the `pg_cron` extension to run a daily scheduled task.
The RPC `check_expiry_notifications()` scans active batches for items that are expired or expiring soon, and upserts notifications using a `dedup_key` (e.g., `EXPIRING_<batch_id>`).

### Realtime UI Updates

The frontend relies on the Supabase Realtime client. A `<NotificationBell />` component subscribes to `INSERT` events on the `public.notifications` table. When a new notification arrives, React Query invalidates the `['notifications']` cache to fetch the new list and increment the unread counter.

## User Experience

- The bell icon in the top right (mobile) and bottom left (desktop) displays an indicator when unread notifications are present.
- Clicking the bell opens a dropdown showing the latest notifications.
- Users can click on a notification to mark it as read and navigate to the relevant screen (e.g., the Daily Inventory or Stock management screen) to resolve the issue.

## Security and RLS

- The `notifications` table has Row Level Security (RLS) enabled.
- `ADMIN` users can view and update (mark as read) any system-wide notifications.
- `USER` role users can view system-wide notifications, but updates are restricted according to the RLS policies to prevent tampering.

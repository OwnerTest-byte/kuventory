import type { AppNotification } from '../types';

/**
 * Universal router utility to resolve the precise target URL for any notification.
 * Enables 1-click navigation directly to the item, batch, daily sheet, or user management.
 */
export function getNotificationRoute(notification: AppNotification): string {
  // 1. Explicit target_id takes top priority (e.g. /settings?tab=users, /daily-inventory)
  if (notification.target_id && notification.target_id.trim().startsWith('/')) {
    return notification.target_id.trim();
  }

  // 2. Direct Item Link: routes directly to the item overview/detail card
  if (notification.item_id) {
    return `/items/${notification.item_id}`;
  }

  // 3. Batches / Expiry
  if (notification.batch_id || notification.type === 'EXPIRING_SOON' || notification.type === 'EXPIRED') {
    return '/items?tab=batches';
  }

  // 4. Low stock / Out of stock / Discrepancy
  if (notification.type === 'LOW_STOCK' || notification.type === 'OUT_OF_STOCK' || notification.type === 'STOCK_DISCREPANCY') {
    return '/reports/low-stock';
  }

  // 5. Password Reset Request
  if (notification.type === 'PASSWORD_RESET') {
    return '/settings?tab=users';
  }

  // 6. Daily Sheet Session
  if (notification.type === 'DAILY_SHEET') {
    return '/daily-inventory';
  }

  // Default fallback
  return '/notifications';
}

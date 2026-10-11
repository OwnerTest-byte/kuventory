import type { AppNotification, InventoryItem } from '../types';

/**
 * Universal router utility to resolve the precise target URL for any notification.
 * Enables 1-click navigation directly to the item, batch, daily sheet, or user management.
 */
export function getNotificationRoute(
  notification: AppNotification,
  availableItems?: InventoryItem[]
): string {
  // 1. Explicit target_id takes top priority (e.g. /settings?tab=users, /daily-inventory)
  if (notification.target_id && notification.target_id.trim().startsWith('/')) {
    return notification.target_id.trim();
  }

  // 2. Direct Item Link: routes directly to the item overview/detail card (or batches if expiry)
  if (notification.item_id) {
    if (notification.type === 'EXPIRING_SOON' || notification.type === 'EXPIRED' || notification.batch_id) {
      return `/items/${notification.item_id}?tab=batches`;
    }
    return `/items/${notification.item_id}`;
  }

  // 3. Fallback: match item from available catalog by name from notification title or message
  if (availableItems && availableItems.length > 0) {
    const textToSearch = `${notification.title || ''} ${notification.message || ''}`.toLowerCase();
    const matched = availableItems.find(item => 
      item.item_name && item.item_name.length > 1 && textToSearch.includes(item.item_name.toLowerCase())
    );
    if (matched) {
      if (notification.type === 'EXPIRING_SOON' || notification.type === 'EXPIRED' || notification.batch_id) {
        return `/items/${matched.id}?tab=batches`;
      }
      return `/items/${matched.id}`;
    }
  }

  // 4. Stock Discrepancy -> Daily Inventory Worksheet directly
  if (notification.type === 'STOCK_DISCREPANCY') {
    return '/daily-inventory';
  }

  // 5. Batches / Expiry general
  if (notification.batch_id || notification.type === 'EXPIRING_SOON' || notification.type === 'EXPIRED') {
    return '/items?tab=batches';
  }

  // 6. Password Reset Request
  if (notification.type === 'PASSWORD_RESET') {
    return '/settings?tab=users';
  }

  // 7. Daily Sheet Session
  if (notification.type === 'DAILY_SHEET') {
    return '/daily-inventory';
  }

  // 8. Low stock / Out of stock fallback
  if (notification.type === 'LOW_STOCK' || notification.type === 'OUT_OF_STOCK') {
    return '/reports/low-stock';
  }

  // Default fallback
  return '/notifications';
}

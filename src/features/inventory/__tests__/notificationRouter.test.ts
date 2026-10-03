import { describe, it, expect } from 'vitest';
import { getNotificationRoute } from '../utils/notificationRouter';
import type { AppNotification } from '../types';

describe('notificationRouter - getNotificationRoute', () => {
  it('prioritizes explicit target_id if present and starts with /', () => {
    const notification: AppNotification = {
      id: 'notif-1',
      title: 'Password Reset Request',
      message: 'Staff requested password reset',
      type: 'PASSWORD_RESET',
      target_id: '/settings?tab=users',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    expect(getNotificationRoute(notification)).toBe('/settings?tab=users');
  });

  it('routes to /settings?tab=users for PASSWORD_RESET without explicit target_id', () => {
    const notification: AppNotification = {
      id: 'notif-2',
      title: 'Password Reset Request',
      message: 'Staff requested password reset',
      type: 'PASSWORD_RESET',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    expect(getNotificationRoute(notification)).toBe('/settings?tab=users');
  });

  it('routes to /items/:id when item_id is provided', () => {
    const notification: AppNotification = {
      id: 'notif-3',
      title: 'Stock Warning',
      message: 'Coke Mismo is running low',
      type: 'LOW_STOCK',
      item_id: 'item-abc-123',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    expect(getNotificationRoute(notification)).toBe('/items/item-abc-123');
  });

  it('routes to /items?tab=batches for EXPIRING_SOON or EXPIRED', () => {
    const expiringNotif: AppNotification = {
      id: 'notif-4',
      title: 'Expiring Soon',
      message: 'Fresh milk expires in 2 days',
      type: 'EXPIRING_SOON',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    const expiredNotif: AppNotification = {
      id: 'notif-5',
      title: 'Batch Expired',
      message: 'Batch B-001 has expired',
      type: 'EXPIRED',
      batch_id: 'batch-999',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    expect(getNotificationRoute(expiringNotif)).toBe('/items?tab=batches');
    expect(getNotificationRoute(expiredNotif)).toBe('/items?tab=batches');
  });

  it('routes to /reports/low-stock for LOW_STOCK without item_id', () => {
    const notification: AppNotification = {
      id: 'notif-6',
      title: 'Low Stock Alert',
      message: 'Multiple items are below threshold',
      type: 'LOW_STOCK',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    expect(getNotificationRoute(notification)).toBe('/reports/low-stock');
  });

  it('routes to /daily-inventory for DAILY_SHEET', () => {
    const notification: AppNotification = {
      id: 'notif-7',
      title: 'Daily Worksheet Active',
      message: 'Closing count in progress',
      type: 'DAILY_SHEET',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    expect(getNotificationRoute(notification)).toBe('/daily-inventory');
  });

  it('falls back to /notifications for general notification without specific target', () => {
    const notification: AppNotification = {
      id: 'notif-8',
      title: 'System Announcement',
      message: 'Maintenance scheduled',
      type: 'SYSTEM',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    expect(getNotificationRoute(notification)).toBe('/notifications');
  });
});

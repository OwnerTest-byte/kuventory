import type { AppNotification } from '../types';

/**
 * Administrative notification types reserved for ADMIN and SUPER_ADMIN:
 * investigation workflows and the administrative queues. STAFF never
 * receive or view these (mirrors the DB RLS policy 20261026170000).
 */
export const ADMIN_NOTIFICATION_TYPES = [
  'PASSWORD_RESET',
  'RECOVERY_REQUEST',
  'ASSISTED_RECOVERY_REQUEST',
  'ACCOUNT_LOCKOUT',
  'SECURITY_ALERT',
  'SYSTEM',
  'MAINTENANCE',
  'STOCK_DISCREPANCY',
  'SHEET_CORRECTION',
  'STAFF_CHANGE_REQUEST',
] as const;

export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

/**
 * STAFF-tier operational alerts — the floor-relevant events every
 * authenticated role receives (mirrors the DB RLS policy 20261026170000).
 * Investigation types (STOCK_DISCREPANCY, SHEET_CORRECTION) are admin-tier
 * and deliberately excluded here.
 */
export const STAFF_NOTIFICATION_TYPES = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'EXPIRING_SOON',
  'EXPIRED',
  'BATCH_DEPLETED',
  'DAILY_SHEET',
] as const;

export type StaffNotificationType = (typeof STAFF_NOTIFICATION_TYPES)[number];

/**
 * Determines whether a given user session is authorized to view or receive a notification.
 *
 * Rules (mirrors the notifications RLS policy 20261026170000):
 * 1. If notification is null/undefined or user is unauthenticated, DENY (false).
 * 2. Targeted recipient (user_id set): recipient only — this is how request
 *    decisions reach their requester.
 * 3. STAFF-tier operational type: ALLOW for all authenticated roles.
 * 4. Administrative type: ALLOW only for ADMIN / SUPER_ADMIN.
 * 5. Default closed: any unrecognized type requires ADMIN or SUPER_ADMIN.
 */
export function isAuthorizedForNotification(
  notif: Partial<AppNotification> | null | undefined,
  userId: string | null | undefined,
  role: string | null | undefined
): boolean {
  if (!notif || !userId) {
    return false;
  }

  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  // 1. Direct recipient isolation: targeted rows are recipient-only
  if (notif.user_id && notif.user_id !== userId) {
    return false;
  }

  const type = notif.type || '';

  // 2. STAFF-tier operational alerts reach every role
  if ((STAFF_NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    return true;
  }

  // 3. Strict isolation of administrative & investigation notifications
  if ((ADMIN_NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    return isAdmin;
  }

  // 4. Principle of least privilege: default closed for unclassified alerts
  return isAdmin;
}

/**
 * Filters a collection of notifications to only include those authorized for the current session.
 */
export function filterAuthorizedNotifications(
  notifications: AppNotification[] | null | undefined,
  userId: string | null | undefined,
  role: string | null | undefined
): AppNotification[] {
  if (!Array.isArray(notifications) || !userId) {
    return [];
  }

  return notifications.filter((notif) => isAuthorizedForNotification(notif, userId, role));
}

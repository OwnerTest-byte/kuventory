import type { AppNotification } from '../types';

/**
 * Administrative notification types that are strictly reserved for ADMIN and SUPER_ADMIN roles.
 * Staff / Operator accounts must NEVER receive or view these notifications.
 */
export const ADMIN_NOTIFICATION_TYPES = [
  'PASSWORD_RESET',
  'RECOVERY_REQUEST',
  'ASSISTED_RECOVERY_REQUEST',
  'ACCOUNT_LOCKOUT',
  'SECURITY_ALERT',
  'SYSTEM',
  'MAINTENANCE',
] as const;

export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

/**
 * Operational inventory notification types broadcasted or targeted to active inventory operators.
 */
export const OPERATIONAL_NOTIFICATION_TYPES = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'EXPIRING_SOON',
  'EXPIRED',
  'BATCH_DEPLETED',
  'STOCK_DISCREPANCY',
  'DAILY_SHEET',
  'SHEET_CORRECTION',
] as const;

export type OperationalNotificationType = (typeof OPERATIONAL_NOTIFICATION_TYPES)[number];

/**
 * Determines whether a given user session is authorized to view or receive a notification.
 * 
 * Rules:
 * 1. If notification is null/undefined or user is unauthenticated, DENY (false).
 * 2. If notification has a specific user_id that differs from current user, DENY (false).
 * 3. If notification is an administrative type, ALLOW only if role is ADMIN or SUPER_ADMIN.
 * 4. If notification is an operational inventory type, ALLOW for all authenticated users.
 * 5. Default closed: Any unrecognized notification type requires ADMIN or SUPER_ADMIN.
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

  // 1. Direct recipient isolation: if targeted to a specific user, ensure match
  if (notif.user_id && notif.user_id !== userId) {
    return false;
  }

  const type = notif.type || '';

  // 2. Strict isolation of administrative & security notifications
  if ((ADMIN_NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    return isAdmin;
  }

  // 3. Operational inventory events authorized for all active team members
  if ((OPERATIONAL_NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    return true;
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

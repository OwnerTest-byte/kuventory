import { describe, it, expect } from 'vitest';
import { 
  isAuthorizedForNotification, 
  filterAuthorizedNotifications,
  ADMIN_NOTIFICATION_TYPES,
  OPERATIONAL_NOTIFICATION_TYPES,
} from '../utils/notificationSecurity';
import type { AppNotification } from '../types';

describe('Zero-Trust Notification Security & Role Isolation', () => {
  const staffUserId = 'user-staff-001';
  const otherStaffUserId = 'user-staff-002';
  const adminUserId = 'user-admin-001';
  const superAdminUserId = 'user-superadmin-001';

  const createMockNotification = (
    type: string, 
    userId: string | null = null, 
    id = 'notif-test-1'
  ): AppNotification => ({
    id,
    user_id: userId,
    title: `Test Notification: ${type}`,
    message: `Details regarding ${type}`,
    type,
    is_read: false,
    created_at: new Date().toISOString(),
  });

  describe('Administrative Notification Isolation', () => {
    it.each(ADMIN_NOTIFICATION_TYPES)(
      'STRICTLY PREVENTS staff from viewing administrative notification type: %s',
      (adminType) => {
        const notif = createMockNotification(adminType);
        
        // Staff role ('USER') must be DENIED
        expect(isAuthorizedForNotification(notif, staffUserId, 'USER')).toBe(false);
      }
    );

    it.each(ADMIN_NOTIFICATION_TYPES)(
      'ALLOWS ADMIN role to view administrative notification type: %s',
      (adminType) => {
        const notif = createMockNotification(adminType);
        expect(isAuthorizedForNotification(notif, adminUserId, 'ADMIN')).toBe(true);
      }
    );

    it.each(ADMIN_NOTIFICATION_TYPES)(
      'ALLOWS SUPER_ADMIN role to view administrative notification type: %s',
      (adminType) => {
        const notif = createMockNotification(adminType);
        expect(isAuthorizedForNotification(notif, superAdminUserId, 'SUPER_ADMIN')).toBe(true);
      }
    );
  });

  describe('Operational Inventory Notifications', () => {
    it.each(OPERATIONAL_NOTIFICATION_TYPES)(
      'ALLOWS staff to view operational inventory notification type: %s',
      (opType) => {
        const notif = createMockNotification(opType);
        expect(isAuthorizedForNotification(notif, staffUserId, 'USER')).toBe(true);
      }
    );

    it.each(OPERATIONAL_NOTIFICATION_TYPES)(
      'ALLOWS ADMIN to view operational inventory notification type: %s',
      (opType) => {
        const notif = createMockNotification(opType);
        expect(isAuthorizedForNotification(notif, adminUserId, 'ADMIN')).toBe(true);
      }
    );
  });

  describe('Direct Recipient Isolation (user_id targeting)', () => {
    it('allows staff to view notification specifically targeted to their user_id', () => {
      const targetedNotif = createMockNotification('DAILY_SHEET', staffUserId);
      expect(isAuthorizedForNotification(targetedNotif, staffUserId, 'USER')).toBe(true);
    });

    it('DENIES staff from viewing a notification explicitly targeted to another user', () => {
      const targetedToOther = createMockNotification('DAILY_SHEET', otherStaffUserId);
      expect(isAuthorizedForNotification(targetedToOther, staffUserId, 'USER')).toBe(false);
    });

    it('DENIES staff from viewing an admin notification even if targeted to their user_id', () => {
      // Even if a password reset ticket references the staff user's ID, staff must NOT view the administrative alert
      const adminNotif = createMockNotification('PASSWORD_RESET', staffUserId);
      expect(isAuthorizedForNotification(adminNotif, staffUserId, 'USER')).toBe(false);
    });
  });

  describe('Fail-Closed and Edge Case Validation', () => {
    it('DENIES any notification when user is unauthenticated (null or empty)', () => {
      const notif = createMockNotification('LOW_STOCK');
      expect(isAuthorizedForNotification(notif, null, 'USER')).toBe(false);
      expect(isAuthorizedForNotification(notif, undefined, 'USER')).toBe(false);
      expect(isAuthorizedForNotification(notif, '', 'USER')).toBe(false);
    });

    it('DENIES when notification object is null or undefined', () => {
      expect(isAuthorizedForNotification(null, staffUserId, 'USER')).toBe(false);
      expect(isAuthorizedForNotification(undefined, staffUserId, 'USER')).toBe(false);
    });

    it('DENIES unknown/unregistered notification types to staff (least-privilege principle)', () => {
      const unknownNotif = createMockNotification('UNKNOWN_NEW_ALERT_TYPE');
      expect(isAuthorizedForNotification(unknownNotif, staffUserId, 'USER')).toBe(false);
    });

    it('allows unknown notification types to administrators (admin fallback)', () => {
      const unknownNotif = createMockNotification('UNKNOWN_NEW_ALERT_TYPE');
      expect(isAuthorizedForNotification(unknownNotif, adminUserId, 'ADMIN')).toBe(true);
    });
  });

  describe('filterAuthorizedNotifications array sanitation', () => {
    it('purges all administrative notifications from a mixed list for a staff user', () => {
      const mixedList: AppNotification[] = [
        createMockNotification('LOW_STOCK', null, '1'),
        createMockNotification('PASSWORD_RESET', null, '2'),
        createMockNotification('OUT_OF_STOCK', null, '3'),
        createMockNotification('SECURITY_ALERT', null, '4'),
        createMockNotification('EXPIRING_SOON', null, '5'),
        createMockNotification('RECOVERY_REQUEST', null, '6'),
      ];

      const filteredForStaff = filterAuthorizedNotifications(mixedList, staffUserId, 'USER');
      
      expect(filteredForStaff.map(n => n.id)).toEqual(['1', '3', '5']);
      expect(filteredForStaff.some(n => n.type === 'PASSWORD_RESET')).toBe(false);
      expect(filteredForStaff.some(n => n.type === 'SECURITY_ALERT')).toBe(false);
      expect(filteredForStaff.some(n => n.type === 'RECOVERY_REQUEST')).toBe(false);
    });

    it('preserves all notifications for an administrator', () => {
      const mixedList: AppNotification[] = [
        createMockNotification('LOW_STOCK', null, '1'),
        createMockNotification('PASSWORD_RESET', null, '2'),
        createMockNotification('OUT_OF_STOCK', null, '3'),
        createMockNotification('SECURITY_ALERT', null, '4'),
      ];

      const filteredForAdmin = filterAuthorizedNotifications(mixedList, adminUserId, 'ADMIN');
      expect(filteredForAdmin.map(n => n.id)).toEqual(['1', '2', '3', '4']);
    });

    it('returns empty array when input is invalid or user is unauthenticated', () => {
      expect(filterAuthorizedNotifications(null, staffUserId, 'USER')).toEqual([]);
      expect(filterAuthorizedNotifications(undefined, staffUserId, 'USER')).toEqual([]);
      expect(filterAuthorizedNotifications([], staffUserId, 'USER')).toEqual([]);
      expect(filterAuthorizedNotifications([createMockNotification('LOW_STOCK')], null, 'USER')).toEqual([]);
    });
  });
});

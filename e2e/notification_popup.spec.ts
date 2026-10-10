import { test, expect } from '@playwright/test';

async function cleanSignOut(page: any) {
  try {
    await page.evaluate(async () => {
      const sb = (window as any).supabase;
      if (sb) {
        try {
          const clientId = sessionStorage.getItem('kuventory_session_client_id');
          await sb.rpc('release_user_session', { p_client_id: clientId });
        } catch {}
        await sb.auth.signOut();
      }
    });
  } catch {}
}

test.describe('Notification Popup System (Bell Removed & 1-Click Redirect)', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  test('Notification bell icon is removed from header and notification popup functions', async ({ page }) => {
    // 1. Log in as staff
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // 2. Verify Notification Bell icon is completely removed from the header
    const bellIcon = page.locator('[data-testid="notification-bell"]');
    await expect(bellIcon).toHaveCount(0);

    // 3. Insert a mock/real notification into Supabase notifications table via evaluate
    const testNotifId = crypto.randomUUID();
    await page.evaluate(async (notifId) => {
      const sb = (window as any).supabase;
      const notifData = {
        id: notifId,
        type: 'LOW_STOCK',
        title: 'Automated Stock Alert',
        message: 'Arabica Coffee Beans below threshold (3 remaining)',
        target_id: null,
        is_read: false
      };
      if (sb) {
        const { error } = await sb.from('notifications').insert(notifData);
        if (error) console.error('Insert notification error:', error);
      }
      // Instant in-app dispatch
      window.dispatchEvent(new CustomEvent('kuventory:show-toast', { detail: notifData }));
    }, testNotifId);

    // 4. Verify that the floating NotificationPopup card appears
    const popupCard = page.locator('div[role="alert"]:has-text("Automated Stock Alert")').first();
    await expect(popupCard).toBeVisible({ timeout: 15000 });

    // 5. Click the popup card to test 1-click redirection
    await popupCard.click();

    // 6. Verify redirection to target URL (/reports/low-stock)
    await page.waitForURL((url) => url.pathname.includes('/reports/low-stock'), { timeout: 10000 });
    expect(page.url()).toContain('/reports/low-stock');

    // 7. Cleanup notification from database
    await page.evaluate(async (notifId) => {
      const sb = (window as any).supabase;
      if (sb) {
        await sb.from('notifications').delete().eq('id', notifId);
      }
    }, testNotifId);
  });
});

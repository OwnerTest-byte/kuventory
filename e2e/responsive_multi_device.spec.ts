import { test, expect } from '@playwright/test';
import { assertSafeE2EEnvironment } from './helpers/testSafetyGuard';

// Check safety before any test execution
const safeConfig = assertSafeE2EEnvironment();

// Comprehensive viewport matrix (including screenshot viewports: 320, 360, 390, 412, 490, 768, 820, 1024, 1280, 1440, 1920)
const VIEWPORTS = [
  // Mobile Narrow & Compact
  { name: 'Mobile Ultra-Compact (320x568)', width: 320, height: 568 },
  { name: 'Mobile Compact (360x800)', width: 360, height: 800 },
  { name: 'Mobile Standard (390x844)', width: 390, height: 844 },
  { name: 'Mobile Android Large (412x915)', width: 412, height: 915 },
  { name: 'Mobile Mid-Range (490x800)', width: 490, height: 800 },
  // Tablet
  { name: 'Tablet iPad Standard (768x1024)', width: 768, height: 1024 },
  { name: 'Tablet iPad Air (820x1180)', width: 820, height: 1180 },
  // Laptop & Desktop
  { name: 'Laptop Compact (1024x768)', width: 1024, height: 768 },
  { name: 'Laptop Standard (1280x720)', width: 1280, height: 720 },
  { name: 'Desktop Widescreen (1440x900)', width: 1440, height: 900 },
  { name: 'Desktop Full HD (1920x1080)', width: 1920, height: 1080 },
];

test.describe('Responsive Adaptability Across All Required Viewports (KUV-P0-05 / KUV-P2-02)', () => {
  for (const vp of VIEWPORTS) {
    test(`Login Screen layout & dialog popup adapt cleanly at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // 1. Verify primary elements are visible
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // 2. Verify zero horizontal overflow on viewport
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // 3. Open Forgot Password Dialog to verify modal geometry
      const forgotLink = page.getByRole('button', { name: /forgot password/i });
      if (await forgotLink.isVisible()) {
        await forgotLink.click();
        const dialogPopup = page.locator('[data-slot="dialog-content"]');
        await expect(dialogPopup).toBeVisible({ timeout: 5000 });

        const popupRect = await dialogPopup.evaluate(el => el.getBoundingClientRect());
        expect(popupRect.left).toBeGreaterThanOrEqual(0);
        expect(popupRect.right).toBeLessThanOrEqual(vp.width + 4);

        // Verify dialog does not cause horizontal page overflow
        const overflowWithDialog = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflowWithDialog).toBe(false);

        // Close dialog
        await page.keyboard.press('Escape');
      }
    });

    test(`Daily Inventory Worksheet layout adapts cleanly at ${vp.name}`, async ({ page }) => {
      if (!safeConfig.staffPassword) {
        test.skip(true, 'Skipping authenticated test: E2E_STAFF_PASSWORD not configured');
        return;
      }

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');
      await page.fill('#email', safeConfig.staffEmail);
      await page.fill('#password', safeConfig.staffPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

      // Navigate to daily inventory
      await page.goto('/daily-inventory');
      await page.waitForLoadState('networkidle');

      // Verify title is visible
      await expect(page.getByRole('heading', { name: /DAILY INVENTORY/i })).toBeVisible({ timeout: 10000 });

      // Verify page layout doesn't horizontally blow out main body
      const hasBodyOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth + 20;
      });
      expect(hasBodyOverflow).toBe(false);

      // Gracefully clean sign out
      await page.evaluate(async () => {
        const sb = (window as any).supabase;
        if (sb) {
          try {
            const clientId = sessionStorage.getItem('kuventory_session_client_id');
            if (clientId) {
              await sb.rpc('release_user_session', { p_client_id: clientId });
            }
          } catch {}
          await sb.auth.signOut();
        }
      });
    });
  }
});

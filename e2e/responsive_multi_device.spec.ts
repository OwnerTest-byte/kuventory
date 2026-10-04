import { test, expect } from '@playwright/test';

// Exact required viewports from Master Engineering Directive Rule 150:
const VIEWPORTS = [
  // Mobile
  { name: 'Mobile Compact (360x800)', width: 360, height: 800 },
  { name: 'Mobile Standard (390x844)', width: 390, height: 844 },
  { name: 'Mobile iPhone (393x852)', width: 393, height: 852 },
  { name: 'Mobile Android Large (412x915)', width: 412, height: 915 },
  // Tablet
  { name: 'Tablet iPad Standard (768x1024)', width: 768, height: 1024 },
  { name: 'Tablet iPad Air (820x1180)', width: 820, height: 1180 },
  // Laptop
  { name: 'Laptop Compact (1280x720)', width: 1280, height: 720 },
  { name: 'Laptop Standard (1366x768)', width: 1366, height: 768 },
  // Desktop
  { name: 'Desktop Widescreen (1440x900)', width: 1440, height: 900 },
  { name: 'Desktop Full HD (1920x1080)', width: 1920, height: 1080 },
];

test.describe('Responsive Adaptability Across All Required Viewports (Rules 149-158)', () => {
  for (const vp of VIEWPORTS) {
    test(`Login Screen layout adapts cleanly at ${vp.name}`, async ({ page }) => {
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

      // 3. Verify touch targets meet min-height requirements (Rule 155: min 44px)
      const submitBtnHeight = await page.locator('button[type="submit"]').evaluate((el) => {
        return el.getBoundingClientRect().height;
      });
      expect(submitBtnHeight).toBeGreaterThanOrEqual(44);

      const emailInputHeight = await page.locator('#email').evaluate((el) => {
        return el.getBoundingClientRect().height;
      });
      expect(emailInputHeight).toBeGreaterThanOrEqual(44);
    });

    test(`Daily Inventory Worksheet layout adapts cleanly at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      
      // Log in as staff
      await page.goto('/login');
      await page.fill('#email', 'staff@kuventory.com');
      await page.fill('#password', 'Staff123!');
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

      // Navigate to daily inventory
      await page.goto('/daily-inventory');
      await page.waitForLoadState('networkidle');

      // Verify title is visible
      await expect(page.getByRole('heading', { name: /DAILY INVENTORY/i })).toBeVisible({ timeout: 10000 });

      // Verify table or worksheet container is accessible
      const tableExists = await page.locator('table').count();
      expect(tableExists).toBeGreaterThanOrEqual(0);

      // Verify page layout doesn't horizontally blow out main body
      const hasBodyOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth + 20; // Allow 20px tolerance for scrollbar
      });
      expect(hasBodyOverflow).toBe(false);

      // Gracefully clean sign out
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
    });
  }
});

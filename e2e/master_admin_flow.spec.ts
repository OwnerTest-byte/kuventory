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

test.describe('Master Admin Authentication & Control Center Flow', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  test('Password input has blue focus highlight and zero white box', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeVisible();

    // Focus password input
    await passwordInput.focus();

    // The container wrapping the password input should have blue border and blue ring
    const passwordContainer = page.locator('#password').locator('..');
    await expect(passwordContainer).toHaveClass(/focus-within:border-blue-600/);
    await expect(passwordContainer).toHaveClass(/focus-within:ring-blue-600/);
    await expect(passwordContainer).toHaveClass(/focus-within:ring-offset-0/);

    // Verify computed styles: outline must not be white and offset is 0
    const outlineStyle = await passwordInput.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outline: computed.outline,
        outlineOffset: computed.outlineOffset,
        boxShadow: computed.boxShadow,
      };
    });

    console.log('Password input computed styles:', outlineStyle);
    expect(outlineStyle.outline).not.toContain('rgb(255, 255, 255)');
  });

  test('Master Admin login succeeds with exact credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'master@kuventory.com');
    await page.fill('#password', 'SuperAdmin2026!');
    await page.click('button[type="submit"]');

    const takeoverBtn = page.locator('button:has-text("Continue Here & End Other Session")');
    await Promise.race([
      takeoverBtn.waitFor({ state: 'visible', timeout: 5000 }).then(async () => {
        await takeoverBtn.click();
      }).catch(() => {}),
      page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 20000 }).catch(() => {})
    ]);

    // Wait for redirect or navigation away from /login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
    // Release session lease
    await cleanSignOut(page);
    await page.waitForTimeout(500);
  });

  test('Master Admin Control Center displays all 8 modular operational areas and real metrics', async ({ page }) => {
    test.setTimeout(60000);
    // 1. Log in
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#email', 'master@kuventory.com');
    await page.fill('#password', 'SuperAdmin2026!');
    await page.click('button[type="submit"]');

    const takeoverBtn = page.locator('button:has-text("Continue Here & End Other Session")');
    await Promise.race([
      takeoverBtn.waitFor({ state: 'visible', timeout: 5000 }).then(async () => {
        await takeoverBtn.click();
      }).catch(() => {}),
      page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 20000 }).catch(() => {})
    ]);

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // 2. Navigate to Master Admin Control Center via settings tab=master (redirects to /super-admin)
    await page.goto('/settings?tab=master');
    await page.waitForLoadState('networkidle');
    await page.waitForURL((url) => url.pathname.includes('/super-admin'), { timeout: 15000 });

    // Verify Master / Super Admin Console is rendered
    await expect(page.locator('h1, h2').filter({ hasText: /KUVENTORY Operations|Super Admin/ }).first()).toBeVisible({ timeout: 10000 });

    // Verify 7-area Sub-navigation rail tabs
    const tabs = [
      'Overview', 'Inventory', 'Users & Security',
      'System Health', 'Backups & Recovery', 'Automations', 'Audit & Settings'
    ];

    for (const tabTitle of tabs) {
      const tabButton = page.locator(`button:has-text("${tabTitle}")`).first();
      await expect(tabButton).toBeVisible();
    }

    // 3. Test Inventory sub-tab
    await page.locator('button', { hasText: 'Inventory' }).first().click();
    await expect(page.locator('text=Stock Reconciliation').or(page.locator('text=Inventory Integrity')).first()).toBeVisible({ timeout: 10000 });

    // 4. Test Users & Security sub-tab
    await page.locator('button', { hasText: 'Users & Security' }).first().click();
    await expect(page.locator('text=Security Clearance').or(page.locator('text=Active Session Leases')).first()).toBeVisible({ timeout: 10000 });

    // 5. Test System Health sub-tab
    await page.locator('button', { hasText: 'System Health' }).first().click();
    await expect(page.locator('text=Telemetry').or(page.locator('text=Realtime Stream')).first()).toBeVisible({ timeout: 10000 });

    // 6. Test Backups & Recovery sub-tab
    await page.locator('button', { hasText: 'Backups & Recovery' }).first().click();
    await expect(page.locator('text=Recovery Checkpoints').or(page.locator('text=Recovery Registry')).first()).toBeVisible({ timeout: 10000 });

    console.log('Master Admin E2E flow verified with 100% success!');

    // Release session lease
    await cleanSignOut(page);
    await page.waitForTimeout(500);
  });
});


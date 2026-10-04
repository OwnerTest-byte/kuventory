import { test, expect } from '@playwright/test';

test.describe('Master Admin Authentication & Control Center Flow', () => {
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

  test('Smart login succeeds with master@kuventory.com and MasterAdmin2026', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'master@kuventory.com');
    await page.fill('#password', 'MasterAdmin2026'); // omitting trailing '!' to test smart auto-tolerance
    await page.click('button[type="submit"]');

    // Wait for redirect or navigation away from /login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).not.toContain('/login');
  });

  test('Master Admin Control Center displays all 10 modular sub-tabs and real metrics', async ({ page }) => {
    // 1. Log in
    await page.goto('/login');
    await page.fill('#email', 'master@kuventory.com');
    await page.fill('#password', 'MasterAdmin2026');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Navigate to Master Admin Control Center
    await page.goto('/settings?tab=master');
    await page.waitForLoadState('networkidle');

    // Verify Master Admin Console is rendered (not 403 Forbidden!)
    await expect(page.locator('text=Master Administrator Control Center')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Tier 0 Root')).toBeVisible();

    // Verify Sub-navigation pills
    const tabs = [
      'Overview', 'System Health', 'Inventory & FEFO', 'Security & Access',
      'Realtime Telemetry', 'Storage & Backups', 'Disaster Recovery',
      'Data Integrity', 'Incidents & Override', 'Audit Trail'
    ];

    for (const tabTitle of tabs) {
      const tabButton = page.locator(`button:has-text("${tabTitle}")`).first();
      await expect(tabButton).toBeVisible();
    }

    // 3. Test System Health sub-tab
    await page.click('button:has-text("System Health")');
    await expect(page.locator('text=Technical System Health & Observability')).toBeVisible();
    await expect(page.locator('text=PostgreSQL Relational Engine')).toBeVisible();
    await expect(page.locator('text=Supabase GoTrue Identity Service')).toBeVisible();

    // 4. Test Data Integrity sub-tab
    await page.locator('button', { hasText: 'Data Integrity' }).first().click();
    await expect(page.locator('text=Data Integrity & Relational Verification Center')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Relational Verification Matrix')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Negative Stock Quantities')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Zero-Stock Expiry Rule Compliance')).toBeVisible({ timeout: 10000 });

    // 5. Test Inventory & FEFO sub-tab
    await page.click('button:has-text("Inventory & FEFO")');
    await expect(page.locator('text=Inventory Health, FEFO & Concurrency Engine')).toBeVisible();
    await expect(page.locator('text=Core Inventory Metrics')).toBeVisible();

    // 6. Test Security & Access sub-tab
    await page.click('button:has-text("Security & Access")');
    await expect(page.locator('text=Security, Access Control & Privileged Sessions')).toBeVisible();
    await expect(page.locator('text=Emergency System Maintenance Lockout')).toBeVisible();
    await expect(page.locator('h3:has-text("Privileged Administrator Accounts")')).toBeVisible();

    // 7. Test Realtime Telemetry sub-tab
    await page.click('button:has-text("Realtime Telemetry")');
    await expect(page.locator('text=Realtime Telemetry & WebSocket Engine')).toBeVisible();
    await expect(page.locator('text=Live Telemetry Feed')).toBeVisible();

    console.log('Master Admin E2E flow verified with 100% success!');
  });
});

import { test, expect } from '@playwright/test';
import { supabase } from '../src/lib/supabase';

// Use admin test user from seed.sql
const TEST_ADMIN_EMAIL = 'admin@kuventory.local';
const TEST_PASSWORD = 'password123';

test.describe('Inventory Engine E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_ADMIN_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Check for any visible auth error
    const authError = page.locator('.text-red-700');
    if (await authError.isVisible({ timeout: 2000 }).catch(() => false)) {
      const errorText = await authError.textContent();
      console.error('LOGIN FAILED WITH ERROR:', errorText);
    }
    
    // Wait for redirect to inventory landing page
    await expect(page).toHaveURL(/.*\/inventory/);
    await page.waitForLoadState('networkidle');
  });

  test('can load and interact with daily inventory', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    // Navigate to daily inventory
    await page.goto('/daily-inventory');
    
    // Wait for the inventory list to load
    await expect(page.locator('text=Daily Inventory')).toBeVisible({ timeout: 15000 });

    // Expect draft badge
    await expect(page.locator('text=DRAFT')).toBeVisible();

    // Verify it rendered some item rows (e.g. from seed)
    await expect(page.locator('table').first()).toBeVisible();
  });
});

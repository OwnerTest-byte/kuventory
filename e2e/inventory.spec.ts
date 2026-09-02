import { test, expect } from '@playwright/test';
import { supabase } from '../src/lib/supabase';

// Use admin test user from seed.sql
const TEST_ADMIN_EMAIL = 'testadmin@kuventory.com';
const TEST_PASSWORD = 'password123';

test.describe('Inventory Engine E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_ADMIN_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    await page.waitForLoadState('networkidle');
  });

  test('can add and remove stock via test bed', async ({ page }) => {
    // Navigate to inventory testbed
    await page.goto('/inventory');
    
    // Wait for the inventory list to load
    await expect(page.locator('text=Current Stock:')).toBeVisible({ timeout: 15000 });

    // Store the initial text (e.g. "Current Stock: 100 Box")
    const initialText = await page.locator('text=Current Stock:').textContent();
    const initialMatch = initialText?.match(/Current Stock:\s*([\d.]+)/);
    const initialStock = initialMatch ? parseFloat(initialMatch[1]) : 0;

    // Add Stock (10)
    await page.fill('input[type="number"]', '10'); // This selects the first number input (add qty)
    await page.click('button:has-text("Add Stock")');

    // Wait for stock to update
    await expect(page.locator(`text=Current Stock: ${initialStock + 10}`)).toBeVisible({ timeout: 10000 });

    // Remove Stock (5)
    await page.locator('input[type="number"]').nth(1).fill('5'); // Second number input (remove qty)
    await page.click('button:has-text("Remove Stock")');

    // Wait for stock to update
    await expect(page.locator(`text=Current Stock: ${initialStock + 5}`)).toBeVisible({ timeout: 10000 });

    // Verify history contains both
    await expect(page.locator('text=ADD').first()).toBeVisible();
    await expect(page.locator('text=REMOVE').first()).toBeVisible();
  });
});

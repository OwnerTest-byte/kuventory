import { test, expect } from '@playwright/test';

test.describe('Notifications', () => {
  // Test relies on the test database seeded state or we can just mock it, but we have real backend
  // For e2e, we'll log in as admin and check if the bell is present and works.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Attempt login if on login page by checking for the email input
    const emailInput = page.locator('input[type="email"]');
    try {
      await emailInput.waitFor({ state: 'visible', timeout: 2000 });
      await emailInput.fill('admin@kuventory.local');
      await page.locator('input[type="password"]').fill('password123');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL('**/inventory');
    } catch (e) {
      // If it doesn't appear, we might already be logged in
    }
  });

  test('notification bell is visible in the layout', async ({ page }) => {
    // Both mobile and desktop view should have a bell
    // On desktop it's in the sidebar bottom or header depending on layout. 
    // We added it next to the role in sidebar, and in mobile header.
    // Use .first() after waiting for at least one visible bell
    const visibleBell = page.getByTestId('notification-bell').and(page.locator(':visible')).first();
    await expect(visibleBell).toBeVisible();
  });

  test('notification dropdown opens on click', async ({ page }) => {
    const visibleBell = page.getByTestId('notification-bell').and(page.locator(':visible')).first();
    await visibleBell.click();

    // The dropdown should appear containing the word Notifications in the heading
    await expect(page.getByRole('heading', { name: /Notifications/i })).toBeVisible();
  });

});

import { test, expect } from '@playwright/test';

test.describe('Authentication and Authorization', () => {

  test('User login -> authenticated landing page -> refresh -> session valid -> logout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    // 1. Go to public route, should be at login
    await page.goto('/login');
    await expect(page.locator('img[alt="KUVENTORY"]')).toBeVisible();
    
    // 2. Login as USER
    await page.fill('input[type="email"]', 'user@kuventory.local');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 3. Authenticated landing page (Inventory)
    await expect(page).toHaveURL(/.*\/inventory/);
    await expect(page.locator('h1:has-text("Inventory Overview")')).toBeVisible();

    // Verify Admin UI is NOT available for USER
    await expect(page.locator('nav a:has-text("Users")')).not.toBeVisible();

    // 4. Refresh page -> session remains valid
    await page.reload();
    await expect(page).toHaveURL(/.*\/inventory/);

    // 5. Try accessing protected admin page -> redirect or forbidden
    await page.goto('/admin');
    await expect(page.locator('text=Access Denied')).toBeVisible();

    // 6. Logout
    await page.locator('[data-testid="logout-button"]').first().dispatchEvent('click');
    await expect(page).toHaveURL(/.*\/login/);

    // 7. Protected page inaccessible after logout
    await page.goto('/inventory');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('Admin login -> authenticated landing page -> Admin UI available -> logout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    
    // 1. Login as ADMIN
    await page.fill('input[type="email"]', 'admin@kuventory.local');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 2. Authenticated landing page (Inventory)
    await expect(page).toHaveURL(/.*\/inventory/);

    // Navigate to admin
    await page.locator('nav a:has-text("Users")').dispatchEvent('click');
    await expect(page).toHaveURL(/.*\/admin/);
    await expect(page.locator('text=User Management')).toBeVisible();

    // 4. Logout
    await page.locator('[data-testid="logout-button"]').first().dispatchEvent('click');
    await expect(page).toHaveURL(/.*\/login/);
  });
});

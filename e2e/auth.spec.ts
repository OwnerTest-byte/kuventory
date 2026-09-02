import { test, expect } from '@playwright/test';

test.describe('Authentication and Authorization', () => {

  test('User login -> authenticated landing page -> refresh -> session valid -> logout', async ({ page }) => {
    // 1. Go to public route, should be at login
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('KUVENTORY');
    
    // 2. Login as USER
    await page.fill('input[type="email"]', 'user@kuventory.local');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 3. Authenticated landing page (Dashboard)
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Dashboard').first()).toBeVisible();

    // Verify Admin UI is NOT available for USER
    await expect(page.locator('text=Admin')).not.toBeVisible();

    // 4. Refresh page -> session remains valid
    await page.reload();
    await expect(page).toHaveURL(/.*\/dashboard/);

    // 5. Try accessing protected admin page -> redirect or forbidden
    await page.goto('/admin');
    await expect(page.locator('text=Access Denied')).toBeVisible();

    // 6. Logout
    // The logout button is in the sidebar (we have to wait for it to be visible or use exact text)
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/.*\/login/);

    // 7. Protected page inaccessible after logout
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('Admin login -> authenticated landing page -> Admin UI available -> logout', async ({ page }) => {
    await page.goto('/login');
    
    // 1. Login as ADMIN
    await page.fill('input[type="email"]', 'admin@kuventory.local');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 2. Authenticated landing page (Dashboard)
    await expect(page).toHaveURL(/.*\/dashboard/);

    // 3. Admin UI is available
    await expect(page.locator('text=Admin').first()).toBeVisible();

    // Navigate to admin
    await page.click('text=Admin');
    await expect(page).toHaveURL(/.*\/admin/);
    await expect(page.locator('text=Admin Panel')).toBeVisible();

    // 4. Logout
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/.*\/login/);
  });
});

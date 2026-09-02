import { test, expect } from '@playwright/test';

test('has foundation title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('KUVENTORY');
});

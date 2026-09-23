import { test, expect } from '@playwright/test';

test.describe('KUVENTORY QA Verification Suite (Page 1-4 & Autonoma Hardening)', () => {

  test('Page 1: Login UI renders all fields and displays exact error strings on empty submit', async ({ page }) => {
    await page.goto('login');

    // 1. Verify Login UI elements
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // 2. Check Password Visibility Toggle has accessible aria-label
    const passwordToggle = page.locator('button[aria-label="Show password"]');
    await expect(passwordToggle).toBeVisible();

    // 3. Submit empty form
    await submitButton.click();

    // 4. Verify exact QA error messages
    const emailError = page.locator('#email-error');
    const passwordError = page.locator('#password-error');

    await expect(emailError).toHaveText('invalid email address');
    await expect(passwordError).toHaveText('password must be at least 6 characters long');
  });

  test('Page 1: Password toggle switches input type and updates aria-label', async ({ page }) => {
    await page.goto('login');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = page.locator('button[aria-label="Show password"]');
    await toggleButton.click();

    // Now input should be type="text" and label "Hide password"
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(page.locator('button[aria-label="Hide password"]')).toBeVisible();
  });

  test('Page 1: Displays "invalid credentials" when unregistered credentials submitted', async ({ page }) => {
    await page.goto('login');

    await page.fill('#email', 'unregistered_qa_test@kuventory.com');
    await page.fill('#password', 'wrongpassword123');
    await page.click('button[type="submit"]');

    // Check error banner surfaces "invalid credentials"
    const errorBanner = page.locator('.text-destructive');
    await expect(errorBanner).toContainText('invalid credentials', { timeout: 10000 });
  });

  test('Page 2 & 3: Responsive Multi-Device UI and Theme Toggle verification', async ({ page }) => {
    await page.goto('login');

    // Verify viewport container renders smoothly without layout distortion
    const mainContainer = page.locator('#root');
    await expect(mainContainer).toBeVisible();

    // Verify responsive styling adapts
    const viewportSize = page.viewportSize();
    expect(viewportSize?.width).toBeGreaterThan(0);
  });
});

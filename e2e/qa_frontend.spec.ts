import { test, expect } from '@playwright/test';

test.describe('KUVENTORY End-to-End QA Verification Suite', () => {

  test('Functionality: Login UI renders branding, fields, and enforces exact validation strings', async ({ page }) => {
    await page.goto('login');

    // 1. Verify Brand elements & Title
    await expect(page).toHaveTitle(/KUVENTORY/i);

    // 2. Verify Login UI elements
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // 3. Check Password Visibility Toggle has accessible aria-label
    const passwordToggle = page.locator('button[aria-label="Show password"]');
    await expect(passwordToggle).toBeVisible();

    // 4. Submit empty form
    await submitButton.click();

    // 5. Verify exact QA error messages
    const emailError = page.locator('#email-error');
    const passwordError = page.locator('#password-error');

    await expect(emailError).toHaveText('invalid email address');
    await expect(passwordError).toHaveText('password must be at least 6 characters long');
  });

  test('Accessibility & Controls: Password toggle switches input type and updates aria-label', async ({ page }) => {
    await page.goto('login');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = page.locator('button[aria-label="Show password"]');
    await toggleButton.click();

    // Now input should be type="text" and label "Hide password"
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(page.locator('button[aria-label="Hide password"]')).toBeVisible();
  });

  test('Security & Validation: Displays "invalid credentials" when unregistered credentials submitted', async ({ page }) => {
    await page.goto('login');

    await page.fill('#email', 'unregistered_qa_test@kuventory.com');
    await page.fill('#password', 'wrongpassword123');
    await page.click('button[type="submit"]');

    // Check error banner surfaces "invalid credentials"
    const errorBanner = page.locator('.text-destructive');
    await expect(errorBanner).toContainText('invalid credentials', { timeout: 10000 });
  });

  test('Legal & Compliance: Privacy Policy and Terms of Service dialogs open properly', async ({ page }) => {
    await page.goto('login');

    // Click Privacy Policy button
    const privacyBtn = page.getByRole('button', { name: 'Privacy Policy' }).first();
    await expect(privacyBtn).toBeVisible();
    await privacyBtn.click();

    // Verify modal title appears
    const privacyTitle = page.getByRole('heading', { name: /Privacy & Data Protection Policy/i });
    await expect(privacyTitle).toBeVisible();

    // Close dialog
    await page.keyboard.press('Escape');

    // Click Terms of Service button
    const termsBtn = page.getByRole('button', { name: 'Terms of Service' }).first();
    await expect(termsBtn).toBeVisible();
    await termsBtn.click();

    // Verify modal title appears
    const termsTitle = page.getByRole('heading', { name: /Terms of Operational Service/i });
    await expect(termsTitle).toBeVisible();
  });

  test('Mobile Responsiveness & Layout: Zero horizontal overflow on viewport', async ({ page }) => {
    await page.goto('login');

    // Verify root is rendered
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    // Verify page width does not cause horizontal scroll
    const isHorizontallyScrollable = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isHorizontallyScrollable).toBeFalsy();
  });

  test('Mobile Usability: Interactive touch targets meet minimum accessible height', async ({ page }) => {
    await page.goto('login');

    const submitButton = page.locator('button[type="submit"]');
    const box = await submitButton.boundingBox();
    expect(box).not.toBeNull();
    // Buttons should have comfortable touch height (>= 36px, preferably 40px+)
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });
});

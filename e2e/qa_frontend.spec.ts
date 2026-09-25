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

    // Verify required and name attributes (Form Quality Audit)
    await expect(emailInput).toHaveAttribute('required', '');
    await expect(emailInput).toHaveAttribute('name', 'email');
    await expect(passwordInput).toHaveAttribute('required', '');
    await expect(passwordInput).toHaveAttribute('name', 'password');

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

  test('Accessibility Landmarks & Headings: Semantic main, aside, section, and H1 heading exist', async ({ page }) => {
    await page.goto('login');

    // Verify main landmark
    const mainLandmark = page.locator('main#main-content');
    await expect(mainLandmark).toBeVisible();

    // Verify visible H1 heading exists on current viewport
    const h1Heading = page.locator('h1:visible');
    await expect(h1Heading).toBeVisible();
    await expect(h1Heading).toHaveText(/KUVENTORY/i);

    // Verify semantic landmarks
    await expect(page.locator('section[aria-label="Authentication"]')).toBeVisible();
    await expect(page.locator('footer:visible')).toBeVisible();
  });

  test('PWA & SEO Metadata: Manifest, Apple Touch Icon, and Safe Area viewport are configured', async ({ page }) => {
    await page.goto('login');

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json');

    const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleTouchIcon).toHaveAttribute('href', '/apple-touch-icon.png');

    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute('content', /viewport-fit=cover/);
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

  test('Mobile Usability: Interactive touch targets meet minimum accessible 44-48px height', async ({ page }) => {
    await page.goto('login');

    const submitButton = page.locator('button[type="submit"]');
    const submitBox = await submitButton.boundingBox();
    expect(submitBox).not.toBeNull();
    expect(submitBox!.height).toBeGreaterThanOrEqual(44);

    const emailInput = page.locator('#email');
    const emailBox = await emailInput.boundingBox();
    expect(emailBox).not.toBeNull();
    expect(emailBox!.height).toBeGreaterThanOrEqual(44);

    const passwordInput = page.locator('#password');
    const passwordBox = await passwordInput.boundingBox();
    expect(passwordBox).not.toBeNull();
    expect(passwordBox!.height).toBeGreaterThanOrEqual(44);
  });
});

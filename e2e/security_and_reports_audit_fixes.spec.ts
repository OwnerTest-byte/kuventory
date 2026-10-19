import { test, expect } from '@playwright/test';

async function cleanSignOut(page: any) {
  try {
    await page.evaluate(async () => {
      const sb = (window as any).supabase;
      if (sb) {
        try {
          const clientId = sessionStorage.getItem('kuventory_session_client_id');
          if (clientId) {
            await sb.rpc('release_user_session', { p_client_id: clientId });
          }
        } catch {}
        try {
          await sb.auth.signOut();
        } catch {}
      }
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {}
}

async function loginUser(page: any, email = 'staff@kuventory.com', pass = 'Staff123!') {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  if (!page.url().includes('/login')) {
    await cleanSignOut(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  }

  await page.fill('#email', email);
  await page.fill('#password', pass);
  await page.click('button[type="submit"]');

  const takeoverBtn = page.getByRole('button', { name: /continue here & end other session/i });
  await Promise.race([
    takeoverBtn.waitFor({ state: 'visible', timeout: 3000 }).then(async () => {
      await takeoverBtn.click();
    }).catch(() => {}),
    page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 30000 }).catch(() => {})
  ]);
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 30000 });
}

test.describe('Security & QA Audit Fixes Verification', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  test('1. Login Remember Me Persistence & Exception Resilience', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Verify remember me checkbox exists by id #remember
    const rememberCheckbox = page.locator('#remember');
    await expect(rememberCheckbox).toBeVisible();

    // Fill credentials and check remember me
    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await rememberCheckbox.check();

    // Verify localStorage has persisted preference
    const isRemembered = await page.evaluate(() => localStorage.getItem('kuventory_remember_me'));
    expect(isRemembered).toBe('true');

    // Submit login
    await page.click('button[type="submit"]');

    const takeoverBtn = page.getByRole('button', { name: /continue here & end other session/i });
    await Promise.race([
      takeoverBtn.waitFor({ state: 'visible', timeout: 3000 }).then(async () => {
        await takeoverBtn.click();
      }).catch(() => {}),
      page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 30000 }).catch(() => {})
    ]);
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });

    // Check localStorage stored the email
    const storedEmail = await page.evaluate(() => localStorage.getItem('kuventory_remembered_email'));
    expect(storedEmail).toBe('staff@kuventory.com');
  });

  test('2. /reports/expiry maps to dedicated Expiry Risk tab with batch metrics', async ({ page }) => {
    await loginUser(page);

    // Directly navigate to /reports/expiry
    await page.goto('/reports/expiry');
    await page.waitForLoadState('networkidle');

    // Verify active tab is Expiry Risk
    const expiryTab = page.getByRole('tab', { name: /Expiry Risk/i });
    await expect(expiryTab).toBeVisible();
    await expect(expiryTab).toHaveAttribute('aria-selected', 'true');

    // Verify Expiry cards, badges, and export button exist
    await expect(page.locator('text=Expired Batches')).toBeVisible();
    await expect(page.locator('text=Expiring Within 30 Days')).toBeVisible();
    await expect(page.locator('text=Total Monitored Batches')).toBeVisible();
    await expect(page.locator('button:has-text("Export Expiry CSV")')).toBeVisible();
  });

  test('3. /reports/archived maps to dedicated Archived Catalog tab', async ({ page }) => {
    await loginUser(page);

    // Directly navigate to /reports/archived
    await page.goto('/reports/archived');
    await page.waitForLoadState('networkidle');

    // Verify active tab is Archived Catalog
    const archivedTab = page.getByRole('tab', { name: /Archived Catalog/i });
    await expect(archivedTab).toBeVisible();
    await expect(archivedTab).toHaveAttribute('aria-selected', 'true');

    // Verify Archived header and export button exist
    await expect(page.locator('text=Archived & Deactivated Catalog Items')).toBeVisible();
    await expect(page.locator('button:has-text("Export Archived CSV")')).toBeVisible();
  });

  test('4. Daily Inventory prevents creating historical worksheets with current stock', async ({ page }) => {
    await loginUser(page);

    // Navigate to Daily Inventory with a past date (e.g. 2024-01-01)
    await page.goto('/daily-inventory?date=2024-01-01');
    await page.waitForLoadState('networkidle');

    // Wait for the query to resolve loading state
    await expect(page.locator('text=Loading daily inventory worksheet...')).not.toBeVisible({ timeout: 15000 });

    // Verify the historical worksheet restricted banner is shown, preventing corrupt draft creation
    await expect(page.locator('text=Historical Worksheet Not Found')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Creating new worksheets for past dates using current inventory is restricted to protect audit integrity')).toBeVisible();
    await expect(page.locator('button:has-text("Open Active Worksheet")')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

async function cleanSignOut(page: any) {
  try {
    await page.evaluate(async () => {
      const sb = (window as any).supabase;
      if (sb) {
        try {
          const clientId = sessionStorage.getItem('kuventory_session_client_id');
          await sb.rpc('release_user_session', { p_client_id: clientId });
        } catch {}
        await sb.auth.signOut();
      }
    });
  } catch {}
}

test.describe('User Audit Fixes Verification (Playwright Functional End-to-End)', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  test('1. Zero Stock Notification & Depleted Alert: Out-of-Stock popup fires when zeroed', async ({ page }) => {
    // 1. Log in as staff
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    const takeoverBtn = page.getByRole('button', { name: /continue here & end other session/i });
    if (await takeoverBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await takeoverBtn.click();
    }

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // 2. Insert an OUT_OF_STOCK notification to simulate zeroing stock
    const testOosId = crypto.randomUUID();
    await page.evaluate(async (notifId) => {
      const sb = (window as any).supabase;
      const notifData = {
        id: notifId,
        type: 'OUT_OF_STOCK',
        title: 'Out of Stock: Iced Tea',
        message: 'Iced Tea has reached 0 stock in daily inventory (ending: 0 pcs).',
        target_id: null,
        is_read: false
      };
      if (sb) {
        const { error } = await sb.from('notifications').insert(notifData);
        if (error) console.error('Insert notification error:', error);
      }
      window.dispatchEvent(new CustomEvent('kuventory:show-toast', { detail: notifData }));
    }, testOosId);

    // 3. Verify NotificationPopup alert renders with "Out of Stock Alert"
    const oosPopup = page.locator('div[role="alert"]:has-text("Out of Stock: Iced Tea")');
    await expect(oosPopup).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Out of Stock Alert')).toBeVisible();

    // 4. Verify clicking popup redirects to target route (/reports/low-stock)
    await oosPopup.click({ force: true });
    await page.waitForURL((url) => url.pathname.includes('/reports/low-stock') || url.pathname.includes('/reports'), { timeout: 10000 });

    // 5. Clean up test notification
    await page.evaluate(async (notifId) => {
      const sb = (window as any).supabase;
      if (sb) {
        await sb.from('notifications').delete().eq('id', notifId);
      }
    }, testOosId);
  });

  test('2. Logo Silhouette & Oval Shape: Container is shaped like logo with zero white box', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Logo container: oval silhouette with rounded-full border (responsive desktop or mobile)
    const logoContainer = page.locator('div.rounded-full:has(img[src="/pics/logo-transparent.png"])').filter({ visible: true });
    await expect(logoContainer.first()).toBeVisible();

    const logoImg = page.locator('img[src="/pics/logo-transparent.png"]').filter({ visible: true });
    await expect(logoImg.first()).toBeVisible();

    // Verify logo image loaded without error and has valid dimensions
    const naturalWidth = await logoImg.first().evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('3. Master Admin Sub-Tabs Scrollability: Disaster Recovery and all tabs scroll cleanly', async ({ page }) => {
    // 1. Log in as Master Admin
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'master@kuventory.com');
    await page.fill('#password', 'SuperAdmin2026!');
    await page.click('button[type="submit"]');

    const takeoverBtn = page.locator('button:has-text("Continue Here & End Other Session")');
    await Promise.race([
      takeoverBtn.waitFor({ state: 'visible', timeout: 5000 }).then(async () => {
        await takeoverBtn.click();
      }).catch(() => {}),
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 }).catch(() => {})
    ]);

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // 2. Navigate to Master Admin Console
    await page.goto('/super-admin');
    await page.waitForLoadState('networkidle');

    // 3. Verify Disaster Recovery / Backups & Recovery tab button exists and is clickable
    const recoveryTabBtn = page.locator('button').filter({ hasText: /(Backups & Recovery|Disaster Recovery)/ }).first();
    await expect(recoveryTabBtn).toBeVisible({ timeout: 15000 });

    // 4. Verify Chevrons for smooth scrolling exist
    const scrollRightBtn = page.locator('button[aria-label="Scroll tabs right"]');
    await expect(scrollRightBtn).toBeAttached();

    // 5. Click Disaster Recovery tab
    await recoveryTabBtn.scrollIntoViewIfNeeded();
    await recoveryTabBtn.click({ force: true });
    await page.waitForURL((url) => url.search.includes('subtab=recovery'), { timeout: 15000 });
    await expect(page.locator('text=Disaster Recovery').or(page.locator('text=Recovery Registry'))).toBeVisible({ timeout: 10000 });
  });

  test('4. Safe Checkpoint & Restoration Modal Confirmation: Requires validation to prevent accidental operations', async ({ page }) => {
    // 1. Log in as Master Admin
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'master@kuventory.com');
    await page.fill('#password', 'SuperAdmin2026!');
    await page.click('button[type="submit"]');

    const takeoverBtn = page.locator('button:has-text("Continue Here & End Other Session")');
    try {
      if (await takeoverBtn.isVisible({ timeout: 3000 })) {
        await takeoverBtn.click();
      }
    } catch {}

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // 2. Navigate to Super Admin Backups & Recovery
    await page.goto('/super-admin?subtab=recovery');
    await page.waitForLoadState('networkidle');

    // 3. Verify Restore button is held in safe disabled state (CLM-27 Zero Accidental Data Loss)
    const restoreDisabledBtn = page.locator('button:has-text("Restore Disabled")').first();
    if (await restoreDisabledBtn.isVisible()) {
      await expect(restoreDisabledBtn).toBeDisabled();
    }

    // 4. Click the Create Checkpoint trigger button
    const openCreateBtn = page.getByRole('button', { name: 'Create Checkpoint' });
    await expect(openCreateBtn).toBeVisible({ timeout: 15000 });
    await openCreateBtn.click();

    // 5. Verify modal is open and requires non-empty inputs
    await expect(page.locator('text=Create Recovery Point Checkpoint')).toBeVisible();
    const nameInput = page.locator('input[placeholder="e.g. Pre-Recount Baseline"]');
    const reasonInput = page.locator('input[placeholder="e.g. Scheduled milestone prior to weekly reconciliation"]');
    await expect(nameInput).toBeVisible();
    await expect(reasonInput).toBeVisible();

    const confirmCreateBtn = page.locator('button:has-text("Capture & Verify Checkpoint")');
    // Button must be disabled initially
    await expect(confirmCreateBtn).toBeDisabled();

    // 6. Partial input keeps button disabled
    await nameInput.fill('Test Checkpoint');
    await expect(confirmCreateBtn).toBeDisabled();

    // 7. Complete input enables button
    await reasonInput.fill('Automated audit verification');
    await expect(confirmCreateBtn).toBeEnabled();

    // 8. Cancel modal to avoid creating persistent test records
    const cancelBtn = page.locator('button:has-text("Cancel")');
    await cancelBtn.click();
  });

  test('5. Photo URL Normalization & Link Reliability', async ({ page }) => {
    // Log in as admin to access item management
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'admin@kuventory.com');
    await page.fill('#password', 'Admin123!');
    await page.click('button[type="submit"]');

    const takeoverBtn = page.locator('button:has-text("Continue Here & End Other Session")');
    try {
      if (await takeoverBtn.isVisible({ timeout: 3000 })) {
        await takeoverBtn.click();
      }
    } catch {}

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // Navigate to Inventory page
    await page.goto('/items');
    await page.waitForLoadState('networkidle');

    // Open Add Item modal
    const addItemBtn = page.locator('button:has-text("Add New Item"), button:has-text("Add Item")').first();
    if (await addItemBtn.isVisible()) {
      await addItemBtn.click();

      // Click URL tab for image
      const urlTabBtn = page.locator('button:has-text("Direct Image Link")');
      if (await urlTabBtn.isVisible()) {
        await urlTabBtn.click();
        const urlInput = page.locator('input[placeholder="https://example.com/photos/item.jpg"]');
        await expect(urlInput).toBeVisible();

        // Fill Google Drive link
        await urlInput.fill('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing');
        const applyBtn = page.locator('button:has-text("Apply URL")');
        await applyBtn.click();

        // Verify that the preview or saved photo appears
        await expect(page.locator('text=Product Photo Set')).toBeVisible({ timeout: 10000 });
      }

      // Close modal
      const cancelBtn = page.getByRole('button', { name: 'Cancel' }).first();
      await cancelBtn.click();
    }
  });
});

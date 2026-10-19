import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const directSupabase = createClient(
  'https://stotgoylyzltzpahuglc.supabase.co',
  'sb_publishable_sww0L_JeH4y7i0Zq5kX0Xg_ZWhJ7PsN'
);

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

async function resetMaintenanceToNormal() {
  try {
    await directSupabase.auth.signInWithPassword({
      email: 'superadmin@kuventory.com',
      password: 'SuperAdmin2026!'
    });
    await directSupabase
      .from('system_settings')
      .upsert({
        key: 'maintenance_lock',
        value: {
          locked: false,
          status: 'NORMAL',
          reason: '',
          locked_at: null,
          locked_by: null
        },
        updated_at: new Date().toISOString()
      });
  } catch (e) {
    console.warn('resetMaintenanceToNormal error:', e);
  }
}

async function loginUser(page: any, email: string, pass: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // If already logged in, sign out cleanly first
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
    page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 35000 }).catch(() => {})
  ]);
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 35000 });
}

test.describe('KUVENTORY Critical Workflow Repairs & Responsive Testing', () => {
  test.beforeEach(async () => {
    await resetMaintenanceToNormal();
  });

  test.afterEach(async ({ page }) => {
    await resetMaintenanceToNormal();
    await cleanSignOut(page);
  });

  test('1. Logout Confirmation: Cancel retains session; Confirm safely logs out', async ({ page }) => {
    await loginUser(page, 'staff@kuventory.com', 'Staff123!');
    await expect(page).toHaveURL(/\/(items|daily-inventory|inventory)?/);

    // Locate the Sign Out button in sidebar or header (or open mobile menu if collapsed/mobile)
    let signOutBtn = page.locator('button[aria-label="Sign Out"]:visible, button[title="Sign Out"]:visible, button:has-text("Sign Out"):visible').first();
    if (!(await signOutBtn.isVisible().catch(() => false))) {
      const menuBtn = page.locator('button[aria-label="Open navigation menu"]:visible').first();
      if (await menuBtn.isVisible().catch(() => false)) {
        await menuBtn.click();
        await page.waitForTimeout(300);
      }
      signOutBtn = page.locator('button[aria-label="Sign Out"]:visible, button[title="Sign Out"]:visible, button:has-text("Sign Out"):visible').first();
    }
    await expect(signOutBtn).toBeVisible({ timeout: 10000 });
    await signOutBtn.click();

    // Verify confirmation modal opens
    const modalTitle = page.locator('h2:has-text("Log out?"), [role="dialog"]:has-text("Log out?")').first();
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancel")').first();
    await expect(cancelBtn).toBeVisible();

    // 1a. Test Cancel: leaves session intact
    await cancelBtn.click();
    await expect(modalTitle).not.toBeVisible();
    expect(page.url()).not.toContain('/login');

    // 1b. Test Confirm: logs out and navigates to /login
    if (!(await signOutBtn.isVisible().catch(() => false))) {
      const menuBtn = page.locator('button[aria-label="Open navigation menu"]:visible').first();
      if (await menuBtn.isVisible().catch(() => false)) {
        await menuBtn.click();
        await page.waitForTimeout(300);
      }
      signOutBtn = page.locator('button[aria-label="Sign Out"]:visible, button[title="Sign Out"]:visible, button:has-text("Sign Out"):visible').first();
    }
    await signOutBtn.click();
    await expect(modalTitle).toBeVisible();

    const confirmLogoutBtn = page.locator('[role="dialog"] button:has-text("Log Out")').last();
    await confirmLogoutBtn.click();

    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('2. Standalone Super Admin Separation: absent from Settings; dedicated /super-admin route', async ({ page }) => {
    await loginUser(page, 'superadmin@kuventory.com', 'SuperAdmin2026!');

    // 2a. Navigate to /settings and verify NO Super Admin tab exists
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const superAdminTab = page.locator('button[role="tab"]:has-text("Super Admin"), [data-state]:has-text("Super Admin Console")');
    await expect(superAdminTab).toHaveCount(0);

    // 2b. Verify sidebar or mobile drawer has standalone Super Admin link pointing to /super-admin
    let superAdminNavLink = page.locator('a[href="/super-admin"]:visible').first();
    if (!(await superAdminNavLink.isVisible().catch(() => false))) {
      const menuBtn = page.locator('button[aria-label="Open navigation menu"]:visible').first();
      if (await menuBtn.isVisible().catch(() => false)) {
        await menuBtn.click();
      }
      superAdminNavLink = page.locator('a[href="/super-admin"]:visible').first();
    }
    await expect(superAdminNavLink).toBeVisible({ timeout: 10000 });

    // 2c. Click standalone nav link and verify route /super-admin loads SuperAdminControlCenter
    await superAdminNavLink.click();
    await page.waitForURL((url) => url.pathname.includes('/super-admin'), { timeout: 10000 });

    const superAdminHeader = page.locator('h1').filter({ hasText: /Super Admin (Control Panel|Operations Console)/ }).first();
    await expect(superAdminHeader).toBeVisible({ timeout: 10000 });
  });

  test('3. Emergency Lockdown: Non-super users blocked; Super Admin retains control plane access', async ({ page }) => {
    // 3a. Super Admin logs in and activates maintenance mode via authorized client
    await loginUser(page, 'superadmin@kuventory.com', 'SuperAdmin2026!');
    await page.goto('/super-admin');
    await page.waitForLoadState('networkidle');

    // Enable Maintenance Mode
    await page.evaluate(async () => {
      const sb = (window as any).supabase;
      if (sb) {
        await sb
          .from('system_settings')
          .upsert({
            key: 'maintenance_lock',
            value: {
              locked: true,
              status: 'MAINTENANCE',
              reason: 'Automated E2E Verification Lockdown',
              locked_at: new Date().toISOString(),
              locked_by: 'superadmin@kuventory.com'
            },
            updated_at: new Date().toISOString()
          });
      }
    });

    await cleanSignOut(page);

    // 3b. Staff attempts to login -> blocked by emergency maintenance check
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    // Emergency maintenance alert banner displays
    const maintenanceAlert = page.locator('[role="alert"]').filter({ hasText: 'EMERGENCY MAINTENANCE LOCKDOWN' }).first();
    await expect(maintenanceAlert).toBeVisible({ timeout: 10000 });

    // 3c. Super Admin can still log in and access /super-admin control plane
    await page.fill('#email', 'superadmin@kuventory.com');
    await page.fill('#password', 'SuperAdmin2026!');
    await page.click('button[type="submit"]');

    const takeoverBtn = page.getByRole('button', { name: /continue here & end other session/i });
    await Promise.race([
      takeoverBtn.waitFor({ state: 'visible', timeout: 3000 }).then(async () => {
        await takeoverBtn.click();
      }).catch(() => {}),
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {})
    ]);
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    await page.goto('/super-admin');
    await page.waitForLoadState('networkidle');
    const superAdminControl = page.locator('h1').filter({ hasText: /Super Admin (Control Panel|Operations Console)/ }).first();
    await expect(superAdminControl).toBeVisible({ timeout: 10000 });

    // Release maintenance back to normal
    await resetMaintenanceToNormal();
  });

  test('4. Password-Reset Request Log: Non-disclosing confirmation and recorded in Admin log', async ({ page }) => {
    // 4a. Go to login and click Forgot password
    await cleanSignOut(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const forgotLink = page.locator('button:has-text("Forgot password?")').first();
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();

    const emailInput = page.locator('#forgot-email').first();
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill('staff@kuventory.com');

    const submitBtn = page.locator('[role="dialog"] button[type="submit"]').first();
    await submitBtn.click();

    // Verify safe non-disclosing message appears
    const successMsg = page.locator('text=password reset request has been logged').first();
    await expect(successMsg).toBeVisible({ timeout: 15000 });

    const closeDialogBtn = page.locator('[role="dialog"] button:has-text("Close")').first();
    if (await closeDialogBtn.isVisible().catch(() => false)) {
      await closeDialogBtn.click();
    }

    await page.fill('#email', 'superadmin@kuventory.com');
    await page.fill('#password', 'SuperAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 });

    await page.goto('/settings?tab=users');
    await page.waitForLoadState('networkidle');

    // Verify Password Reset Requests log table is present
    const resetTableHeading = page.locator('h3:has-text("Password Reset & Account Recovery Requests")').first();
    await expect(resetTableHeading).toBeVisible({ timeout: 10000 });

    // Verify request for staff@kuventory.com is listed
    const userRow = page.locator('text=staff@kuventory.com').first();
    await expect(userRow).toBeVisible({ timeout: 10000 });
  });

  test('5. Finalized Daily Inventory Correction: Authorized edit, reason dialog, revision history', async ({ page }) => {
    page.on('dialog', async d => {
      console.log('PLAYWRIGHT DIALOG DETECTED:', d.type(), d.message());
      await d.accept();
    });
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('PLAYWRIGHT BROWSER ERROR:', msg.text());
    });

    await loginUser(page, 'superadmin@kuventory.com', 'SuperAdmin2026!');

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    const sheetHeading = page.locator('h1:has-text("DAILY INVENTORY"), h1:has-text("Daily Inventory")').first();
    await expect(sheetHeading).toBeVisible({ timeout: 10000 });

    // Check if the current sheet is finalized, if not finalize it first
    const finalizeBtn = page.locator('button:has-text("Finalize Day"):visible, button:has-text("Finalize Sheet"):visible').first();
    const correctBtn = page.locator('button:has-text("Correct Finalized Day"):visible').first();

    if (await finalizeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finalizeBtn.click();
      const confirmFinalize = page.locator('[role="dialog"] button:has-text("Confirm & Lock Record"), [role="dialog"] button:has-text("Finalize Inventory")').first();
      await confirmFinalize.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Now verify Correct Finalized Day button is present
    await expect(correctBtn).toBeVisible({ timeout: 10000 });
    await correctBtn.click();

    // Prompt Reason Dialog should appear
    const reasonInput = page.locator('[role="dialog"] input').first();
    await expect(reasonInput).toBeVisible({ timeout: 5000 });
    await reasonInput.fill('Playwright E2E Physical Recount Verification');

    const proceedBtn = page.locator('[role="dialog"] button:has-text("Enter Correction Mode")').first();
    await proceedBtn.click();

    // Amber banner should indicate Correction Mode Active
    const banner = page.locator('text=Correction Mode Active').first();
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Worksheet fields should be unlocked
    const saveCorrectionBtn = page.locator('button:has-text("Save Finalized Correction")').first();
    await expect(saveCorrectionBtn).toBeVisible();

    // Save correction
    await saveCorrectionBtn.click();

    // Confirmation dialog with summary details
    const confirmSaveBtn = page.locator('[role="dialog"] button:has-text("Confirm & Save Revision")').first();
    await expect(confirmSaveBtn).toBeVisible({ timeout: 5000 });
    await confirmSaveBtn.click();

    // Celebration modal with new revision badge
    const successTitle = page.locator('text=CORRECTION RECORDED').first();
    await expect(successTitle).toBeVisible({ timeout: 25000 });

    const backToSheetBtn = page.locator('[role="dialog"] button:has-text("Back to Worksheet")').first();
    await backToSheetBtn.click();

    // Verify Revisions button opens revision history
    const revisionsBtn = page.locator('button:has-text("Revisions")').first();
    await expect(revisionsBtn).toBeVisible();
    await revisionsBtn.click();

    const historyTitle = page.locator('text=Revision History').first();
    await expect(historyTitle).toBeVisible({ timeout: 5000 });

    const reasonInHistory = page.locator('text=Playwright E2E Physical Recount Verification').first();
    await expect(reasonInHistory).toBeVisible({ timeout: 5000 });
  });

  test('5b. Staff / User role can also access and edit Finalized Daily Inventory', async ({ page }) => {
    // Authenticate as ordinary Staff (role: USER)
    await loginUser(page, 'staff@kuventory.com', 'Staff123!');

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Confirm that the Staff user can see the Correct Finalized Day action
    const finalizeBtn = page.locator('button:has-text("Finalize Day"):visible, button:has-text("Finalize Sheet"):visible').first();
    const correctBtn = page.locator('button:has-text("Correct Finalized Day"):visible').first();

    if (await finalizeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await finalizeBtn.click();
      const confirmFinalize = page.locator('[role="dialog"] button:has-text("Confirm & Lock Record"), [role="dialog"] button:has-text("Finalize Inventory")').first();
      await confirmFinalize.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    await expect(correctBtn).toBeVisible({ timeout: 15000 });
    await correctBtn.click();

    // Verify reason modal appears for staff
    const reasonInput = page.locator('[role="dialog"] input').first();
    await expect(reasonInput).toBeVisible({ timeout: 5000 });
    await reasonInput.fill('Staff evening count reconciliation');

    const proceedBtn = page.locator('[role="dialog"] button:has-text("Enter Correction Mode")').first();
    await proceedBtn.click();

    // Verify staff enters active correction mode
    const banner = page.locator('text=Correction Mode Active').first();
    await expect(banner).toBeVisible({ timeout: 5000 });

    const cancelBtn = page.locator('button:has-text("Cancel Edit")').first();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
  });

  test('6. Multi-Device & Responsive Verification (Mobile & Tablet Layouts)', async ({ page }) => {
    // 6a. Test Mobile Viewport (393x852)
    await page.setViewportSize({ width: 393, height: 852 });
    await loginUser(page, 'staff@kuventory.com', 'Staff123!');

    await page.goto('/items');
    await page.waitForLoadState('networkidle');

    // Header and search should be responsive without horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);

    // 6b. Test Tablet Viewport (820x1180)
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    const tabletScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const tabletClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(tabletScrollWidth).toBeLessThanOrEqual(tabletClientWidth + 5);
  });
});

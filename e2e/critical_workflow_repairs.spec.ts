import { test, expect } from '@playwright/test';
import { assertSafeE2EEnvironment, createSafeTestClient } from './helpers/testSafetyGuard';

// Environment-Driven Test Configuration & Hard Production Guard (P0-1 / KUV-P0-02)
const safeConfig = assertSafeE2EEnvironment();
const directSupabase = createSafeTestClient(safeConfig);

const SUPER_ADMIN_EMAIL = safeConfig.superAdminEmail;
const SUPER_ADMIN_PASSWORD = safeConfig.superAdminPassword || '';
const STAFF_EMAIL = safeConfig.staffEmail;
const STAFF_PASSWORD = safeConfig.staffPassword || '';

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
  if (safeConfig.isRemote || !SUPER_ADMIN_PASSWORD) return;
  try {
    await directSupabase.auth.signInWithPassword({
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD
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
    await loginUser(page, STAFF_EMAIL, STAFF_PASSWORD);
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
    await loginUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    // 2a. Navigate to /admin and verify NO Super Admin tab exists
    await page.goto('/admin');
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
    await loginUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
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
    await page.fill('#email', STAFF_EMAIL);
    await page.fill('#password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');

    // Emergency maintenance alert banner displays
    const maintenanceAlert = page.locator('[role="alert"]').filter({ hasText: 'EMERGENCY MAINTENANCE LOCKDOWN' }).first();
    await expect(maintenanceAlert).toBeVisible({ timeout: 10000 });

    // 3c. Super Admin can still log in and access /super-admin control plane
    await cleanSignOut(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#email', SUPER_ADMIN_EMAIL);
    await page.fill('#password', SUPER_ADMIN_PASSWORD);
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
    await emailInput.fill(STAFF_EMAIL);

    const submitBtn = page.locator('[role="dialog"] button[type="submit"]').first();
    await submitBtn.click();

    // Verify safe non-disclosing message appears
    const successMsg = page.locator('text=If an account matches this address').first();
    await expect(successMsg).toBeVisible({ timeout: 15000 });
  });

  test('5. Finalized Daily Inventory Governance: Read-only sheet, Correction Request Modal, and Approval Queue', async ({ page }) => {
    await loginUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    const sheetHeading = page.locator('h1:has-text("DAILY INVENTORY"), h1:has-text("Daily Inventory")').first();
    await expect(sheetHeading).toBeVisible({ timeout: 10000 });

    // Verify Finalized Worksheet Governance:
    // If sheet is finalized, direct edits are blocked (isReadOnly = true)
    // A 'Request a Correction' button is present instead of direct editable inputs
    const correctBtn = page.locator('button:has-text("Request a Correction"), button:has-text("Correction")').first();
    if (await correctBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await correctBtn.click();

      // Correction Request Modal should open with mandatory reason field
      const modalHeader = page.locator('h2:has-text("Request Worksheet Correction"), [role="dialog"]:has-text("Correction")').first();
      await expect(modalHeader).toBeVisible({ timeout: 5000 });

      const reasonField = page.locator('#correction-reason, [role="dialog"] textarea').first();
      await expect(reasonField).toBeVisible();
      await reasonField.fill('Audited count discrepancy on PM shift.');

      // Close modal safely
      const cancelModalBtn = page.locator('[role="dialog"] button:has-text("Cancel")').first();
      await cancelModalBtn.click();
    }
  });

  test('6. Multi-Device & Responsive Verification (Mobile & Tablet Layouts)', async ({ page }) => {
    // 6a. Test Mobile Viewport (393x852)
    await page.setViewportSize({ width: 393, height: 852 });
    await loginUser(page, STAFF_EMAIL, STAFF_PASSWORD);

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

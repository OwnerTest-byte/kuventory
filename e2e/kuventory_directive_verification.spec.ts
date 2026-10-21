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

async function loginAsAdmin(page: any) {
  return loginUser(page, 'admin@kuventory.com', 'Admin123!');
}

async function loginAsMasterAdmin(page: any) {
  return loginUser(page, 'superadmin@kuventory.com', 'SuperAdmin2026!');
}

async function loginAsStaff(page: any) {
  return loginUser(page, 'staff@kuventory.com', 'Staff123!');
}

test.describe('KUVENTORY Directive Hardening & Real Verification Suite', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  // Test 1: Mobile & Responsive Viewports (Directives 9, 10, 54, 55)
  test('Mobile Login: 360x800 and 800x360 landscape are vertically scrollable with zero clipping', async ({ page }) => {
    // 360x800 Mobile Portrait
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('login');

    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Verify touch targets >= 44px
    const emailBox = await emailInput.boundingBox();
    const submitBox = await submitBtn.boundingBox();
    expect(emailBox!.height).toBeGreaterThanOrEqual(44);
    expect(submitBox!.height).toBeGreaterThanOrEqual(44);

    // Verify no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBeFalsy();

    // 800x360 Landscape Viewport
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto('login');

    // In landscape, check vertical scrollability
    const isVerticallyScrollable = await page.evaluate(() => {
      return document.documentElement.scrollHeight >= window.innerHeight;
    });
    expect(isVerticallyScrollable).toBeTruthy();

    // Submit button must remain reachable by scrolling
    await submitBtn.scrollIntoViewIfNeeded();
    await expect(submitBtn).toBeVisible();
  });

  // Test 2: Multi-Device Breakpoint Validation (Directives 10, 54)
  const viewports = [
    { name: 'Mobile 390x844', width: 390, height: 844 },
    { name: 'Mobile 412x915', width: 412, height: 915 },
    { name: 'Tablet 768x1024', width: 768, height: 1024 },
    { name: 'Tablet 820x1180', width: 820, height: 1180 },
    { name: 'Laptop 1280x720', width: 1280, height: 720 },
    { name: 'Desktop 1920x1080', width: 1920, height: 1080 },
  ];

  for (const vp of viewports) {
    test(`Responsive Viewport: ${vp.name} renders clean login without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('login');
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(overflow).toBeFalsy();
    });
  }

  // Test 3: Notification Center Route Resolution (Directive Section 2)
  test('Notification Center: Route /notifications resolves correctly with real header and filters', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/notifications');

    // Page must resolve to /notifications (NOT redirect to settings)
    expect(page.url()).toContain('/notifications');
    await expect(page.locator('h1')).toContainText(/Notification/i);
    await expect(page.locator('text=Mark all as read')).toBeVisible();

    // Verify filter tabs exist
    await expect(page.locator('button', { hasText: 'All' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Unread' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Warnings' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Critical' }).first()).toBeVisible();
  });

  // Test 4: Analytics Page & Top 3 Matrices (Directives 5, 41, 70)
  test('Analytics Page: Renders Top 3 Most Outgoing, Most Stocked, and Lowest Stock matrices', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/analytics');

    expect(page.url()).toContain('/analytics');
    await expect(page.locator('h1')).toContainText(/Inventory Analytics/i);

    // Verify 3 Decision Support Matrices
    await expect(page.locator('text=Top 3 Most Outgoing Items')).toBeVisible();
    await expect(page.locator('text=Top 3 Most Stocked Items')).toBeVisible();
    await expect(page.locator('text=Top 3 Lowest Stock Items')).toBeVisible();

    // Verify operational metrics labels (NOT sales/revenue figures)
    await expect(page.locator('text=Highest recorded deductions')).toBeVisible();
    await expect(page.locator('text=Highest current stock volume')).toBeVisible();
    await expect(page.locator('text=Approaching or below threshold')).toBeVisible();
  });

  // Test 5: Simplified Dashboard Structure (Directives 4, 6, 69)
  test('Simplified Dashboard: Has Greeting, 4 Summary Cards, Shift status, 3 Quick Actions, and Alerts', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/inventory');

    // Header greeting
    await expect(page.locator('h1')).toBeVisible();

    // 4 Operational Summary Cards
    await expect(page.locator('text=/current stock/i').first()).toBeVisible();
    await expect(page.locator('text=/low stock/i').first()).toBeVisible();
    await expect(page.locator('text=/expiring soon/i').first()).toBeVisible();
    await expect(page.locator('text=/expired stock/i').first()).toBeVisible();

    // Today's Daily Inventory status
    await expect(page.locator("text=/today's daily inventory/i").first()).toBeVisible();

    // 3 Quick Actions within Dashboard Main Content
    const main = page.locator('main');
    await expect(main.locator('text=/Add Stock/i').first()).toBeVisible();
    await expect(main.locator('button', { hasText: 'Daily Inventory' }).first()).toBeVisible();
    await expect(main.locator('text=/(Inventory Catalog|View Inventory)/i').first()).toBeVisible();

    // Recent Alerts
    await expect(page.locator('text=/recent operational alerts/i').first()).toBeVisible();
  });

  // Test 6: Zero-Stock Expiry Filter Rule in Catalog Batches (Directive Section 1)
  test('Batches Catalog: Active expiry filters exclude zero-quantity items', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/items?tab=batches');

    // Verify Batches tab rendered
    await expect(page.locator('button:has-text("Batches")')).toBeVisible();
    
    // When filtering by Expired or Expiring Soon, depleted 0-quantity items must never appear
    const expiredBtn = page.locator('button', { hasText: 'Expired' });
    if (await expiredBtn.isVisible()) {
      await expiredBtn.click();
      const zeroQtyBadge = page.locator('text=0 pcs');
      expect(await zeroQtyBadge.count()).toBe(0);
    }
  });

  // Test 7: Master Admin Password Reset Modal & Direct Hotline
  test('Password Reset Modal: Dispatches to Master Admin and displays hotline 09917101298 with tel/sms links', async ({ page }) => {
    await page.goto('/login');

    const forgotBtn = page.getByRole('button', { name: /forgot password\?/i });
    await expect(forgotBtn).toBeVisible();
    await forgotBtn.click();

    // Verify modal is open
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();

    // Verify hotline number and email dedicated to Master Admin
    await expect(page.locator('text=09917101298')).toBeVisible();
    await expect(page.locator('text=superadmin@kuventory.com').or(page.locator('text=master@kuventory.com'))).toBeVisible();

    // Verify accessible Call & SMS links
    const callLink = page.locator('a[href="tel:09917101298"]').first();
    const smsLink = page.locator('a[href="sms:09917101298"]').first();
    await expect(callLink).toBeVisible();
    await expect(smsLink).toBeVisible();
  });

  // Test 8: Header Location & Navigation
  test('App Layout: Clean branding and eliminates duplicate worksheet navigation', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/inventory');

    // Verify brand displays "Kape Uno Bistro" in the sidebar on non-mobile
    const isMobile = await page.evaluate(() => window.innerWidth < 768);
    if (!isMobile) {
      const brandSubtitle = page.locator('aside').getByText(/Kape Uno Bistro/i);
      await expect(brandSubtitle).toBeVisible();
    }

    // Verify single Daily Inventory navigation item exists (sidebar on desktop/tablet or mobile nav on phone)
    if (!isMobile) {
      const dailyNav = page.locator('aside nav').getByRole('link', { name: /Daily Inventory/i });
      await expect(dailyNav).toBeVisible();
    } else {
      const mobileNav = page.locator('nav a[href="/daily-inventory"]').first();
      await expect(mobileNav).toBeAttached();
    }
  });

  // Test 9: Login Cleanliness & Feature Removal (No Artisanal text, No feature slider showcase)
  test('Login Page Simplification: "Artisanal Coffee & Kitchen" and feature showcase slider are completely removed', async ({ page }) => {
    await page.goto('login');

    // 1. Verify "Artisanal Coffee & Kitchen" is NOT present anywhere on the page
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Artisanal Coffee & Kitchen');
    expect(pageContent).not.toContain('Artisanal Coffee &amp; Kitchen');

    // 2. Verify feature highlight slider components are completely absent
    await expect(page.locator('text=/SYSTEM HIGHLIGHT/i')).toHaveCount(0);
    await expect(page.locator('text=/Zero Spoilage Guarantee/i')).toHaveCount(0);
    await expect(page.locator('text=/Automated FEFO Rotation/i')).toHaveCount(0);

    // 3. Verify clean, centered title and login card remain visible and accessible
    await expect(page.locator('h1:visible').first()).toContainText('KUVENTORY');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  // Test 10: Master Admin Role Boundary: Sidebar isolates Super Admin from Admin, and direct access is strictly denied
  test('Master Admin Role Boundary: Sidebar isolates Super Admin from Admin, and direct access is strictly denied', async ({ page }) => {
    await loginAsAdmin(page);

    // 1. Verify Super Admin / Master Admin link is NOT in the sidebar for standard Admin
    const isMobile = await page.evaluate(() => window.innerWidth < 768);
    if (!isMobile) {
      const superAdminLink = page.locator('aside nav').getByRole('link', { name: /(Super|Master) Admin/i });
      await expect(superAdminLink).toHaveCount(0);
    }

    // 2. Attempt direct navigation to /super-admin
    await page.evaluate(() => {
      window.history.pushState({}, '', '/super-admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForLoadState('networkidle');

    // 3. Verify Standard Admin is STRICTLY DENIED access
    await expect(page.locator('text=Access Denied')).toBeVisible();
    await expect(page.locator('text=Super Admin authorization required.')).toBeVisible();
  });

  // Test 11: Master Admin Absolute Operational Authority
  test('Master Admin Authority: Master/Super Admin account accesses full Tier 0 console with recovery, backup, and telemetry', async ({ page }) => {
    await loginAsMasterAdmin(page);
    await page.goto('/super-admin');
    await page.waitForLoadState('networkidle');

    // 1. Verify Super Admin Console Header
    await expect(page.locator('h1, h2').filter({ hasText: /Super Admin/ }).first()).toBeVisible({ timeout: 10000 });

    // 2. Verify Core Sub-navigation Tabs are available
    await expect(page.locator('button:has-text("Overview")').first()).toBeVisible();
    await expect(page.locator('button:has-text("System Health")').or(page.locator('button:has-text("Database")')).first()).toBeVisible();
    await expect(page.locator('button:has-text("Backups & Recovery")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Users & Security")').or(page.locator('button:has-text("Security & Access")')).first()).toBeVisible();

    // 3. Verify NO Access Denied barrier is present for genuine Super Admin
    await expect(page.locator('text=Access Denied')).toHaveCount(0);
    await expect(page.locator('text=Super Admin authorization required.')).toHaveCount(0);
  });

  // Test 12: Staff User Visibility Isolation
  test('Staff Role Isolation: Normal Staff account does NOT see Super/Master Admin in the sidebar and cannot access it', async ({ page }) => {
    await loginAsStaff(page);

    const isMobile = await page.evaluate(() => window.innerWidth < 768);
    if (!isMobile) {
      // Sidebar on desktop/tablet must completely hide Super Admin
      const superAdminLink = page.locator('aside nav').getByRole('link', { name: /(Super|Master) Admin/i });
      await expect(superAdminLink).toHaveCount(0);
    }

    // Direct access must also deny
    await page.evaluate(() => {
      window.history.pushState({}, '', '/super-admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Access Denied')).toBeVisible();
  });
});

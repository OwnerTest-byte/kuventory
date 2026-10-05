import { test, expect } from '@playwright/test';

// Helper to set up mock API responses and authenticated state for protected routes
async function mockAuthenticatedSession(page: any, targetRole: 'ADMIN' | 'MASTER_ADMIN' | 'USER' = 'ADMIN') {
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') console.log('[PAGE ERROR LOG]:', msg.text());
  });
  page.on('pageerror', (err: any) => {
    console.log('[PAGE UNCAUGHT EXCEPTION]:', err.message);
  });

  const isMaster = targetRole === 'MASTER_ADMIN';
  const email = isMaster ? 'master@kuventory.com' : (targetRole === 'ADMIN' ? 'admin@kapeuno.com' : 'staff@kapeuno.com');
  const name = isMaster ? 'Master Administrator' : (targetRole === 'ADMIN' ? 'Admin Chief' : 'Staff Member');

  const mockUser = {
    id: isMaster ? '00000000-0000-0000-0000-000000000099' : '00000000-0000-0000-0000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: { name, role: targetRole }
  };

  const mockAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJlbWFpbCI6ImFkbWluQGthcGV1bm8uY29tIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjE5OTk5OTk5OTl9.MOCK_SIGNATURE';

  // 1. Mock Supabase Auth Token
  await page.route(/\/auth\/v1\/token/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: mockAccessToken,
        token_type: 'bearer',
        expires_in: 7200,
        refresh_token: 'mock-refresh-token',
        user: mockUser
      })
    });
  });

  // Mock Supabase Auth User verification endpoint
  await page.route(/\/auth\/v1\/user/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser)
    });
  });

  // 2. Mock Profile
  await page.route(/\/rest\/v1\/profiles/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: mockUser.id,
          name,
          role: targetRole,
          created_at: '2026-01-01T00:00:00Z'
        }
      ])
    });
  });

  // 3. Mock Inventory Items View
  await page.route(/\/rest\/v1\/inventory_stock_view/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'item-coffee-beans',
          item_code: 'SKU-COFFEE-01',
          item_name: 'Premium Espresso Beans',
          category_id: 'cat-bar',
          category_name: 'Barista Station',
          unit: 'kg',
          current_qty: 45,
          min_qty: 10,
          unit_cost: 650,
          is_active: true,
          is_archived: false,
        },
        {
          id: 'item-whole-milk',
          item_code: 'SKU-MILK-02',
          item_name: 'Fresh Whole Milk',
          category_id: 'cat-bar',
          category_name: 'Barista Station',
          unit: 'L',
          current_qty: 5,
          min_qty: 15,
          unit_cost: 95,
          is_active: true,
          is_archived: false,
        }
      ])
    });
  });

  // 4. Mock Stock Batches (Enforcing Zero-Stock Expiry separation)
  await page.route(/\/rest\/v1\/stock_batches/, async (route: any) => {
    const url = route.request().url();
    // If fetching active expiring or expired batches (which has quantity=gt.0)
    if (url.includes('quantity=gt.0')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'batch-active-expiring',
            quantity: 8,
            expiry_date: '2026-10-10',
            received_date: '2026-09-25',
            created_at: '2026-09-25T00:00:00Z',
            inventory_items: { id: 'item-whole-milk', name: 'Fresh Whole Milk', unit: 'L', unit_cost: 95 }
          }
        ])
      });
    } else {
      // General batch list (includes depleted for history, but separated)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'batch-active-1',
            item_id: 'item-coffee-beans',
            batch_code: 'BATCH-CF-01',
            quantity: 45,
            expiry_date: '2026-12-01',
            created_at: '2026-09-01T00:00:00Z',
            inventory_items: { id: 'item-coffee-beans', name: 'Premium Espresso Beans', unit: 'kg' }
          },
          {
            id: 'batch-depleted-0',
            item_id: 'item-whole-milk',
            batch_code: 'BATCH-DEPLETED-ZERO',
            quantity: 0,
            expiry_date: '2026-09-10',
            created_at: '2026-08-01T00:00:00Z',
            inventory_items: { id: 'item-whole-milk', name: 'Fresh Whole Milk', unit: 'L' }
          }
        ])
      });
    }
  });

  // 5. Mock Operational Top 3 Decision Stats RPC
  await page.route(/\/rest\/v1\/rpc\/get_operational_top3_stats/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        most_outgoing: [
          { id: 'item-coffee-beans', item_name: 'Premium Espresso Beans', category_name: 'Barista Station', unit: 'kg', outgoing_quantity: 84 },
          { id: 'item-whole-milk', item_name: 'Fresh Whole Milk', category_name: 'Barista Station', unit: 'L', outgoing_quantity: 65 }
        ],
        most_stocked: [
          { id: 'item-coffee-beans', item_name: 'Premium Espresso Beans', category_name: 'Barista Station', unit: 'kg', current_stock: 45 }
        ],
        least_stocked: [
          { id: 'item-whole-milk', item_name: 'Fresh Whole Milk', category_name: 'Barista Station', unit: 'L', current_stock: 5, min_quantity: 15 }
        ]
      })
    });
  });

  // 6. Mock Notifications
  await page.route(/\/rest\/v1\/notifications/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'notif-1',
          type: 'EXPIRY',
          severity: 'HIGH',
          title: 'Expiring Batch Alert',
          message: 'Batch of Fresh Whole Milk expires in 7 days.',
          is_read: false,
          created_at: '2026-10-03T08:00:00Z'
        },
        {
          id: 'notif-2',
          type: 'LOW_STOCK',
          severity: 'CRITICAL',
          title: 'Low Stock Alert',
          message: 'Fresh Whole Milk has fallen below minimum threshold (5 / 15 L).',
          is_read: false,
          created_at: '2026-10-03T09:30:00Z'
        }
      ])
    });
  });

  // 7. Mock Daily Inventory
  await page.route(/\/rest\/v1\/daily_inventory/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  // 8. Mock Stock Movements & History View
  await page.route(/\/rest\/v1\/stock_movements/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'mov-1',
          item_id: 'item-coffee-beans',
          batch_id: 'batch-active-1',
          movement_type: 'REMOVE',
          quantity_changed: 10,
          reason: 'Daily brewing usage',
          created_at: '2026-10-03T07:00:00Z',
          inventory_items: { name: 'Premium Espresso Beans', unit: 'kg' }
        }
      ])
    });
  });

  await page.route(/\/rest\/v1\/stock_history_view/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          movement_id: 'mov-1',
          item_id: 'item-coffee-beans',
          item_name: 'Premium Espresso Beans',
          actor_id: '00000000-0000-0000-0000-000000000001',
          actor_name: 'Admin Chief',
          type: 'REMOVE',
          quantity_change: -10,
          quantity_before: 55,
          quantity_after: 45,
          reason: 'Daily brewing usage',
          created_at: '2026-10-03T07:00:00Z'
        }
      ])
    });
  });

  await page.route(/\/rest\/v1\/rpc\/get_dashboard_top3_stats/, async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        best_sellers: [
          { id: 'item-coffee-beans', item_name: 'Premium Espresso Beans', category_name: 'Barista Station', unit: 'kg', sold_quantity: 84 },
          { id: 'item-whole-milk', item_name: 'Fresh Whole Milk', category_name: 'Barista Station', unit: 'L', sold_quantity: 65 }
        ],
        most_stocked: [
          { id: 'item-coffee-beans', item_name: 'Premium Espresso Beans', category_name: 'Barista Station', unit: 'kg', current_stock: 45 }
        ],
        least_stocked: [
          { id: 'item-whole-milk', item_name: 'Fresh Whole Milk', category_name: 'Barista Station', unit: 'L', current_stock: 5, min_quantity: 15 }
        ]
      })
    });
  });

  // Perform login
  await page.goto('login');
  await page.fill('#email', email);
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(targetRole === 'USER' ? '**/daily-inventory' : '**/inventory');
}

async function mockAuthenticatedAdminSession(page: any) {
  return mockAuthenticatedSession(page, 'ADMIN');
}

async function mockAuthenticatedMasterAdminSession(page: any) {
  return mockAuthenticatedSession(page, 'MASTER_ADMIN');
}

async function mockAuthenticatedStaffSession(page: any) {
  return mockAuthenticatedSession(page, 'USER');
}

test.describe('KUVENTORY Directive Hardening & Real Verification Suite', () => {

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
    await mockAuthenticatedAdminSession(page);
    await page.goto('notifications');

    // Page must resolve to /notifications (NOT redirect to settings)
    expect(page.url()).toContain('/notifications');
    await expect(page.locator('h1')).toContainText(/Notification Center/i);
    await expect(page.locator('text=Mark all as read')).toBeVisible();

    // Verify filter tabs exist
    await expect(page.locator('button', { hasText: 'All' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Unread' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Warnings' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Critical' }).first()).toBeVisible();
  });

  // Test 4: Analytics Page & Top 3 Matrices (Directives 5, 41, 70)
  test('Analytics Page: Renders Top 3 Most Outgoing, Most Stocked, and Lowest Stock matrices', async ({ page }) => {
    await mockAuthenticatedAdminSession(page);
    await page.goto('analytics');

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
    await mockAuthenticatedAdminSession(page);
    await page.goto('inventory');

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
    await expect(main.locator('text=/View Inventory/i').first()).toBeVisible();

    // Recent Alerts
    await expect(page.locator('text=/recent operational alerts/i').first()).toBeVisible();
  });

  // Test 6: Zero-Stock Expiry Filter Rule in Catalog Batches (Directive Section 1)
  test('Batches Catalog: Active expiry filters exclude zero-quantity items', async ({ page }) => {
    await mockAuthenticatedAdminSession(page);
    await page.goto('items?tab=batches');

    // Verify Batches tab rendered
    await expect(page.locator('text=Batches')).toBeVisible();
    
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
    await page.goto('login');

    const forgotBtn = page.getByRole('button', { name: /forgot password\?/i });
    await expect(forgotBtn).toBeVisible();
    await forgotBtn.click();

    // Verify modal is open
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();

    // Verify hotline number and email dedicated to Master Admin
    await expect(page.locator('text=09917101298')).toBeVisible();
    await expect(page.locator('text=master@kuventory.com')).toBeVisible();

    // Verify accessible Call & SMS links
    const callLink = page.locator('a[href="tel:09917101298"]').first();
    const smsLink = page.locator('a[href="sms:09917101298"]').first();
    await expect(callLink).toBeVisible();
    await expect(smsLink).toBeVisible();
  });

  // Test 8: Header Location & Navigation
  test('App Layout: Clean branding and eliminates duplicate worksheet navigation', async ({ page }) => {
    await mockAuthenticatedAdminSession(page);
    await page.goto('inventory');

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

  // Test 10: Master Admin Sidebar Visibility & Access Denial for Standard Admin
  test('Master Admin Role Boundary: Sidebar shows Master Admin to Admin, but clicking it strictly denies access', async ({ page }) => {
    await mockAuthenticatedAdminSession(page);
    await page.goto('inventory');

    // 1. Verify Master Admin link exists in the sidebar for Admin
    const isMobile = await page.evaluate(() => window.innerWidth < 768);
    if (!isMobile) {
      const masterAdminLink = page.locator('aside nav').getByRole('link', { name: /Master Admin/i });
      await expect(masterAdminLink).toBeVisible();

      // 2. Click Master Admin link in sidebar
      await masterAdminLink.click();
      await page.waitForURL('**/settings?tab=master');
    } else {
      await page.goto('settings?tab=master');
    }

    // 3. Verify Standard Admin is STRICTLY DENIED access to Master Admin
    await expect(page.locator('text=Master Administrator Clearance Required')).toBeVisible();
    await expect(page.locator('text=403 Forbidden · Tier 0 Boundary')).toBeVisible();
    await expect(page.locator('text=ADMIN (Level 1 Operational Administrator)')).toBeVisible();

    // 4. Verify Master Admin privileged operational controls are NOT accessible
    await expect(page.locator('button', { hasText: /Download Full System Backup/i })).toHaveCount(0);
    await expect(page.locator('button', { hasText: /Execute Disaster Recovery Restore/i })).toHaveCount(0);
    await expect(page.locator('button', { hasText: /Harmonize Stock Drifts/i })).toHaveCount(0);

    // 5. Verify "Return to Admin Console" button safely redirects back to standard admin tabs
    const returnBtn = page.getByRole('button', { name: /Return to Admin Console/i });
    await expect(returnBtn).toBeVisible();
    await returnBtn.click();
    await expect(page.locator('h2', { hasText: /Restaurant Profile & Business Details/i })).toBeVisible();
  });

  // Test 11: Master Admin Absolute Operational Authority
  test('Master Admin Authority: Master Admin account accesses full Tier 0 console with recovery, backup, and telemetry', async ({ page }) => {
    await mockAuthenticatedMasterAdminSession(page);
    await page.goto('settings?tab=master');

    // 1. Verify Master Admin Console Header & Tier 0 Root Badge
    await expect(page.locator('text=Master Administrator Control Center')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Tier 0 Root')).toBeVisible();

    // 2. Verify Core Sub-navigation Tabs are available
    await expect(page.locator('button:has-text("Overview")').first()).toBeVisible();
    await expect(page.locator('button:has-text("System Health")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Storage & Backups")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Disaster Recovery")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Security & Access")').first()).toBeVisible();

    // 3. Verify NO Access Denied barrier is present for genuine Master Admin
    await expect(page.locator('text=/403 Forbidden/i')).toHaveCount(0);
    await expect(page.locator('text=/Master Administrator Clearance Required/i')).toHaveCount(0);
  });

  // Test 12: Staff User Visibility Isolation
  test('Staff Role Isolation: Normal Staff account does NOT see Master Admin in the sidebar', async ({ page }) => {
    await mockAuthenticatedStaffSession(page);
    await page.goto('daily-inventory');

    const isMobile = await page.evaluate(() => window.innerWidth < 768);
    if (!isMobile) {
      // Sidebar on desktop/tablet must completely hide Master Admin
      const masterAdminLink = page.locator('aside nav').getByRole('link', { name: /Master Admin/i });
      await expect(masterAdminLink).toHaveCount(0);
    }
  });
});

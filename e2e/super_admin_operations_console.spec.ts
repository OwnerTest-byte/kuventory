import { test, expect } from '@playwright/test';

async function loginAsSuperAdmin(page: any) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Fill in credentials for Super Admin
  const emailInput = page.locator('input[type="email"], input[name="email"], input#email').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"], input#password').first();

  await emailInput.fill('superadmin@kuventory.com');
  await passwordInput.fill('SuperAdmin2026!');

  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();

  // If another session was occupied, confirm the takeover to continue, or proceed on direct redirect
  const takeoverButton = page.locator('button:has-text("Continue Here & End Other Session")');
  await Promise.race([
    takeoverButton.waitFor({ state: 'visible', timeout: 4000 }).then(async () => {
      await takeoverButton.click();
    }).catch(() => {}),
    page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {})
  ]);

  // Wait for redirect away from login
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Super Admin Operations Console - E2E Verification', () => {

  test('All 11 operational subtabs navigate cleanly and render live telemetry without date formatting errors', async ({ page }) => {
    // 1. Authenticate as Super Admin
    await loginAsSuperAdmin(page);

    // 2. Navigate directly to /super-admin
    await page.goto('/super-admin');
    await page.waitForLoadState('networkidle');

    // 3. Verify page header
    await expect(page.locator('h1, h2').filter({ hasText: /Super Admin/ }).first()).toBeVisible({ timeout: 10000 });

    // 4. Verify all navigation rail tabs exist
    const tabLabels = [
      'Overview',
      'Database',
      'Storage',
      'Backups & Recovery',
      'Scheduled Services',
      'Monitoring',
      'Security & Access',
      'Incidents',
      'Logs',
      'Settings'
    ];

    for (const label of tabLabels) {
      const tabButton = page.locator(`button:has-text("${label}")`).first();
      await expect(tabButton).toBeVisible();
    }

    // 5. Scheduled Services Tab (Date Formatting Resilience Check)
    const automationsTab = page.locator('button:has-text("Scheduled Services")').or(page.locator('button:has-text("Automations")')).first();
    await automationsTab.click();
    await expect(page.locator('text=Background Automation & Maintenance Engine')).toBeVisible({ timeout: 5000 });
    
    // Verify no RangeError or uncaught error overlay
    const errorOverlay = page.locator('text=RangeError: Invalid time value');
    await expect(errorOverlay).not.toBeVisible();

    // Verify all 5 jobs are listed
    await expect(page.locator('text=Daily Inventory Sync & Archival')).toBeVisible();
    await expect(page.locator('text=Low Stock & Depleted Batch Detection')).toBeVisible();
    await expect(page.locator('text=Perishable Batch Expiry Audit')).toBeVisible();
    await expect(page.locator('text=Daily Operations Summary Digest')).toBeVisible();
    await expect(page.locator('text=Disaster Recovery Point Checkpoint')).toBeVisible();

    // 6. Verify Deployment Tab is Absent and Release Console is linked from Overview (Audit Requirement)
    const deploymentsTab = page.locator('button:has-text("Deployments")');
    await expect(deploymentsTab).toHaveCount(0);
    const overviewTab = page.locator('button:has-text("Overview")').first();
    await overviewTab.click();
    await expect(page.locator('text=Production Release & Deployment Management')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('a[href*="github.com/OwnerTest-byte/kuventory/actions"]').first()).toBeVisible();

    // 7. Database Tab (Read-Only Drift Analysis & Controlled Cleanup)
    const dbTab = page.locator('button:has-text("Database")').first();
    await dbTab.click();
    await expect(page.locator('text=PostgreSQL Engine & Real-Time Monitoring')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Analyze Stock Drift")')).toBeVisible();
    await expect(page.locator('button:has-text("Scan Depleted Batches")')).toBeVisible();

    // 8. Storage Tab (Real Bucket Diagnostics)
    const storageTab = page.locator('button:has-text("Storage")').first();
    await storageTab.click();
    await expect(page.locator('text=Supabase Storage & Object Monitoring')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Test Storage")')).toBeVisible();

    // 9. Backups & Recovery Tab (Distinguishable Recovery Tiers)
    const recoveryTab = page.locator('button:has-text("Backups & Recovery")').first();
    await recoveryTab.click();
    await expect(page.locator('text=Disaster Recovery & Recovery Registry')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Complete JSON Archive')).toBeVisible();
    await expect(page.locator('text=Verified Registry')).toBeVisible();
    await expect(page.locator('text=Managed PostgreSQL')).toBeVisible();
    await expect(page.locator('button:has-text("Create Checkpoint")')).toBeVisible();

    // 10. Incidents Tab (Manual Reporting & Lifecycle Transitions)
    const incidentsTab = page.locator('button:has-text("Incidents")').first();
    await incidentsTab.click();
    await expect(page.locator('text=System Incident Management & Operational Triage')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Report Incident")')).toBeVisible();

    // 11. Security & Access Tab (Session Leases & Lockdown)
    const securityTab = page.locator('button:has-text("Security & Access")').first();
    await securityTab.click();
    await expect(page.locator('text=Security Clearance & Session Lease Management')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Active Browser & Device Session Leases')).toBeVisible();

    // 12. Settings Tab (Authoritative Policy Persistence)
    const settingsTab = page.locator('button:has-text("Settings")').first();
    await settingsTab.click();
    await expect(page.locator('text=Super Admin System Configuration & Governance')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Daily Inventory Sheet Archival Threshold')).toBeVisible();
    await expect(page.locator('text=Disaster Recovery Checkpoint Retention')).toBeVisible();
    await expect(page.locator('text=superadmin@kuventory.com')).toBeVisible();
  });
});

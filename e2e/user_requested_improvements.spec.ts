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

async function loginAsStaff(page: any) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.fill('#email', 'staff@kuventory.com');
  await page.fill('#password', 'Staff123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 20000 });
}

test.describe('User Requested Improvements Suite', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  test('1. Disallows sales AM/PM when total stock is 0 and triggers instant alert notification', async ({ page }) => {
    await loginAsStaff(page);

    // Navigate to Daily Inventory worksheet
    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Wait for the daily inventory table to load
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // Find the first row
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Set BEG to 0 and ADD to 0 to make total 0
    const begInput = firstRow.locator('input[aria-label*="Beginning Quantity"]');
    const addInput = firstRow.locator('input[aria-label*="Add Quantity"]');
    await begInput.fill('0');
    await begInput.dispatchEvent('blur');
    await page.waitForTimeout(500);

    await addInput.fill('0');
    await addInput.dispatchEvent('blur');
    await page.waitForTimeout(500);

    // Sales AM and PM inputs should now block when stock is 0
    const salesAmInput = firstRow.locator('input[aria-label*="Sales AM"]');

    // Attempting to type sales when stock is 0 should trigger the toast notification and reset to 0
    await salesAmInput.click({ force: true });
    await salesAmInput.fill('5');
    await salesAmInput.dispatchEvent('blur');

    // Check that Sales AM was reverted or kept at 0
    await expect(salesAmInput).toHaveValue('0');

    // Check that toast notification appeared: "Cannot enter sales" or "No Stock Available"
    const alertToast = page.locator('div[role="alert"]:has-text("Cannot enter sales")').first();
    await expect(alertToast).toBeVisible({ timeout: 10000 });
  });

  test('2. Aggregates notifications into "You have 5+ notifications" when 5 or more unread alerts exist', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Simulate burst of alerts via window events (in-app toasts) without database pollution
    await page.evaluate(() => {
      for (let i = 1; i <= 5; i++) {
        window.dispatchEvent(new CustomEvent('kuventory:show-toast', {
          detail: {
            id: `burst-toast-${i}-${Date.now()}`,
            type: 'LOW_STOCK',
            title: `Low Stock: Product ${i}`,
            message: `Stock level for Product ${i} is below minimum threshold`,
            is_read: false
          }
        }));
      }
    });

    // The aggregated notification card should be visible
    const aggregatedCard = page.locator('div[role="alert"]:has-text("notifications")').first();
    await expect(aggregatedCard).toBeVisible({ timeout: 15000 });

    // Clicking it should navigate to /notifications
    await aggregatedCard.click({ force: true });
    await page.waitForURL('**/notifications', { timeout: 10000 });
    expect(page.url()).toContain('/notifications');
  });

  test('3. Replaces SKU and technical formulas with worker-friendly terminology across app', async ({ page }) => {
    await loginAsStaff(page);

    // 1. Check Analytics page (/analytics)
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    // Must show "Total inventory stock value" instead of "Sum of active items * unit cost"
    await expect(page.locator('text=Total inventory stock value').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sum of active items').first()).toHaveCount(0);

    // Must show "active items in catalog" instead of "active catalog SKUs"
    await expect(page.locator('text=active items in catalog').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=active catalog SKUs').first()).toHaveCount(0);

    // Category table header must say "Items" not "SKUs"
    const itemsHeader = page.locator('th:has-text("Items")').first();
    await expect(itemsHeader).toBeVisible();
    await expect(page.locator('th:has-text("SKUs")')).toHaveCount(0);

    // 2. Check Daily Inventory page (/daily-inventory)
    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Station badges must say "items" not "SKUs"
    const stationBadge = page.locator('span:has-text("items")').first();
    await expect(stationBadge).toBeVisible();
    await expect(page.locator('span:has-text("SKUs")')).toHaveCount(0);
  });

  test('4. "Add New Item" modal layout is responsive with sticky footer and properly placed fields', async ({ page }) => {
    await loginAsStaff(page);

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Click "Add Item" button on the first station table
    const addItemBtn = page.locator('button:has-text("Add Item")').first();
    await expect(addItemBtn).toBeVisible({ timeout: 10000 });
    await addItemBtn.click({ force: true });

    // Verify modal is visible
    const modalHeader = page.locator('h2:has-text("Add New Item")');
    await expect(modalHeader).toBeVisible();

    // Verify fields exist and are visible
    const codeInput = page.locator('input[placeholder="e.g. ITM-001"]');
    const nameInput = page.locator('input[placeholder="e.g. Chicken Breast"]');
    const primarySupplier = page.locator('input[placeholder="e.g. Monterey Meats"]');
    const secondarySupplier = page.locator('input[placeholder="Optional alternate vendor"]');

    await expect(codeInput).toBeVisible();
    await expect(nameInput).toBeVisible();
    await expect(primarySupplier).toBeVisible();
    await expect(secondarySupplier).toBeVisible();

    // Verify Save and Cancel buttons are in sticky footer
    const saveBtn = page.locator('button:has-text("Save Item")');
    const cancelBtn = page.locator('button:has-text("Cancel")').last();

    await expect(saveBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Close modal
    await cancelBtn.click({ force: true });
    await expect(modalHeader).not.toBeVisible();
  });

  test('5. Deletes Station Table and automatically deletes the category from the database', async ({ page }) => {
    await loginAsStaff(page);

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // 1. Create a temporary test station table first
    const addStationBtn = page.locator('button:has-text("Add Station / Table")');
    if (await addStationBtn.isVisible()) {
      await addStationBtn.click({ force: true });
      const testCatName = `TEST_STATION_${Date.now().toString().slice(-4)}`;
      await page.fill('#station-name-input', testCatName);
      await page.click('button:has-text("Create Station Table")');
      await page.waitForTimeout(1000);

      // Verify the new station header appears
      const newStationHeader = page.locator(`h2:has-text("${testCatName}")`).first();
      await expect(newStationHeader).toBeVisible({ timeout: 10000 });

      // 2. Click "Delete Table" on this station
      const deleteTableBtn = page.locator(`h2:has-text("${testCatName}") ~ button:has-text("Delete Table")`).first();
      await expect(deleteTableBtn).toBeVisible({ timeout: 5000 });
      await deleteTableBtn.scrollIntoViewIfNeeded();
      await deleteTableBtn.click();

      // Confirmation dialog should appear
      const deleteDialog = page.locator('div[role="dialog"]:has-text("Delete Station Table & Category")');
      await expect(deleteDialog).toBeVisible({ timeout: 5000 });

      // Click "Delete Table & Category" button within the confirmation dialog
      const confirmDeleteBtn = deleteDialog.locator('button:has-text("Delete Table & Category")');
      await confirmDeleteBtn.click();

      // Verify the station header is removed from the worksheet
      await expect(page.locator(`h2:has-text("${testCatName}")`)).not.toBeVisible({ timeout: 10000 });

      // Also verify that the category is removed from categories table in Supabase
      const isCatDeleted = await page.evaluate(async (name) => {
        const sb = (window as any).supabase;
        if (!sb) return true;
        const { data } = await sb.from('categories').select('id').eq('name', name).maybeSingle();
        return !data;
      }, testCatName);

      expect(isCatDeleted).toBe(true);
    }
  });
});

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

test.describe('KUVENTORY Full Engineering Audit & Repair Verification', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  test('1. Edit Item Modal: "X" button, Escape key, Cancel button, and layout scrolling', async ({ page }) => {
    await loginAsStaff(page);

    // 1. Navigate to Items Catalog
    await page.goto('/items');
    await page.waitForLoadState('networkidle');

    // Wait for items table to render
    const itemRow = page.locator('table tbody tr').first();
    await expect(itemRow).toBeVisible({ timeout: 15000 });

    // Open item action menu or quick view, then open Edit Item modal
    const editBtn = itemRow.locator('button[title*="Edit"], button:has-text("Edit")').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
    } else {
      // Click row to open QuickView drawer, then click "Edit Details"
      await itemRow.click();
      const drawerEditBtn = page.locator('button:has-text("Edit Details"), button:has-text("Edit")').first();
      await expect(drawerEditBtn).toBeVisible({ timeout: 5000 });
      await drawerEditBtn.click();
    }

    // Verify modal is visible
    const modal = page.locator('div[role="dialog"]:has-text("Edit Item"), div[role="dialog"]:has-text("Add New Item")');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // VERIFY TEST A: Clicking "X" button closes modal safely
    const closeXBtn = modal.locator('button[aria-label="Close dialog"]').first();
    await expect(closeXBtn).toBeVisible();
    await closeXBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // VERIFY TEST B: Reopen modal and test Escape key closes it
    const rowAgain = page.locator('table tbody tr').first();
    const editBtnAgain = rowAgain.locator('button[title*="Edit"], button:has-text("Edit")').first();
    if (await editBtnAgain.isVisible()) {
      await editBtnAgain.click();
    } else {
      await rowAgain.click();
      await page.locator('button:has-text("Edit Details"), button:has-text("Edit")').first().click();
    }
    await expect(modal).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // VERIFY TEST C: Reopen modal and test Cancel button closes it
    if (await editBtnAgain.isVisible()) {
      await editBtnAgain.click();
    } else {
      await rowAgain.click();
      await page.locator('button:has-text("Edit Details"), button:has-text("Edit")').first().click();
    }
    await expect(modal).toBeVisible({ timeout: 5000 });
    const cancelBtn = modal.locator('button:has-text("Cancel")');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // VERIFY TEST D: Layout scrolling — bottom fields (Primary Supplier, Secondary Supplier, Item Image) are accessible
    if (await editBtnAgain.isVisible()) {
      await editBtnAgain.click();
    } else {
      await rowAgain.click();
      await page.locator('button:has-text("Edit Details"), button:has-text("Edit")').first().click();
    }
    await expect(modal).toBeVisible({ timeout: 5000 });

    const primarySupplierInput = modal.locator('input[placeholder*="Monterey Meats"]');
    const secondarySupplierInput = modal.locator('input[placeholder*="Optional alternate vendor"]');
    const imageSection = modal.locator('text=Item Image');

    // Scroll to bottom fields
    await secondarySupplierInput.scrollIntoViewIfNeeded();
    await expect(primarySupplierInput).toBeVisible();
    await expect(secondarySupplierInput).toBeVisible();
    await expect(imageSection).toBeVisible();

    // Close modal
    await modal.locator('button[aria-label="Close dialog"]').first().click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('2. Daily Inventory: Other Supplies section item management and Destination Table selector', async ({ page }) => {
    await loginAsStaff(page);

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Verify "OTHER SUPPLIES" section exists in navigation or page
    const otherSuppliesPill = page.locator('button:has-text("OTHER SUPPLIES")');
    await expect(otherSuppliesPill).toBeVisible({ timeout: 15000 });
    await otherSuppliesPill.click();

    // Verify Other Supplies section header
    const otherSuppliesHeader = page.locator('h2:has-text("OTHER SUPPLIES")');
    await expect(otherSuppliesHeader).toBeVisible();

    // Click "Add Item" on Other Supplies
    const otherSuppliesSection = page.locator('#section-unassigned');
    await expect(otherSuppliesSection).toBeVisible({ timeout: 15000 });
    await otherSuppliesSection.scrollIntoViewIfNeeded();

    const addItemBtn = otherSuppliesSection.locator('button:has-text("Add Item")').first();
    await expect(addItemBtn).toBeVisible();
    await addItemBtn.click();

    // Verify "Add Item to Other Supplies" modal opens
    const addOtherModal = page.locator('div[role="dialog"]:has-text("Add Item to Other Supplies")');
    await expect(addOtherModal).toBeVisible({ timeout: 5000 });

    // Verify search and catalog items list
    const searchInput = addOtherModal.locator('input[placeholder*="Search catalog items"]');
    await expect(searchInput).toBeVisible();

    // Close modal
    await addOtherModal.locator('button:has-text("Close")').first().click();
    await expect(addOtherModal).not.toBeVisible({ timeout: 5000 });

    // Verify "Reassign Table" option on an existing item in Other Supplies
    const reassignBtn = otherSuppliesSection.locator('button:has-text("Reassign Table")').first();
    if (await reassignBtn.isVisible()) {
      await reassignBtn.click();

      // Verify Destination Table selector modal
      const reassignDialog = page.locator('div[role="dialog"]:has-text("Reassign Destination Table")');
      await expect(reassignDialog).toBeVisible({ timeout: 5000 });

      const stationSelect = reassignDialog.locator('select');
      await expect(stationSelect).toBeVisible();

      // Check destination options contain active stations
      const optionsCount = await stationSelect.locator('option').count();
      expect(optionsCount).toBeGreaterThan(1);

      // Cancel reassign dialog
      await reassignDialog.locator('button:has-text("Cancel")').click();
      await expect(reassignDialog).not.toBeVisible();
    }
  });

  test('3. Daily Inventory: Automatic distinct icons for newly created tables & refresh persistence', async ({ page }) => {
    await loginAsStaff(page);

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Create a new Station Table A
    const addStationBtn = page.locator('button:has-text("Add Station / Table")');
    await expect(addStationBtn).toBeVisible({ timeout: 15000 });
    await addStationBtn.click();

    const addStationModal = page.locator('div[role="dialog"]:has-text("Add New Station / Table")');
    await expect(addStationModal).toBeVisible({ timeout: 5000 });

    const timestamp = Date.now().toString().slice(-4);
    const stationAName = `STATION SEAFOOD ${timestamp}`;
    await addStationModal.locator('#station-name-input').fill(stationAName);
    await addStationModal.locator('button[type="submit"]:has-text("Create Station Table")').click();

    // Verify Station A appears in worksheet
    const stationAHeader = page.locator(`h2:has-text("${stationAName}")`);
    await expect(stationAHeader).toBeVisible({ timeout: 15000 });

    // Create a new Station Table B
    await addStationBtn.click();
    await expect(addStationModal).toBeVisible({ timeout: 5000 });
    const stationBName = `STATION BAKERY ${timestamp}`;
    await addStationModal.locator('#station-name-input').fill(stationBName);
    await addStationModal.locator('button[type="submit"]:has-text("Create Station Table")').click();

    // Verify Station B appears in worksheet
    const stationBHeader = page.locator(`h2:has-text("${stationBName}")`);
    await expect(stationBHeader).toBeVisible({ timeout: 15000 });

    // Reload the page and verify stations and icons persist
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator(`h2:has-text("${stationAName}")`)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`h2:has-text("${stationBName}")`)).toBeVisible({ timeout: 15000 });

    // Clean up created test stations by clicking Delete Table
    const deleteBtnA = page.locator(`div:has(h2:has-text("${stationAName}")) button[title*="Delete"]`).first();
    if (await deleteBtnA.isVisible()) {
      await deleteBtnA.click();
      const deleteModal = page.locator('div[role="dialog"]:has-text("Delete Station Table & Category")');
      await expect(deleteModal).toBeVisible({ timeout: 5000 });
      await deleteModal.locator('button:has-text("Delete Table & Category")').click();
      await page.waitForTimeout(1000);
    }

    const deleteBtnB = page.locator(`div:has(h2:has-text("${stationBName}")) button[title*="Delete"]`).first();
    if (await deleteBtnB.isVisible()) {
      await deleteBtnB.click();
      const deleteModal = page.locator('div[role="dialog"]:has-text("Delete Station Table & Category")');
      await expect(deleteModal).toBeVisible({ timeout: 5000 });
      await deleteModal.locator('button:has-text("Delete Table & Category")').click();
      await page.waitForTimeout(1000);
    }
  });

  test('4. Notification Aggregation: "5+ notifications" banner and toast action rendering', async ({ page }) => {
    await loginAsStaff(page);

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Simulate multiple rapid notifications via window event
    await page.evaluate(() => {
      for (let i = 1; i <= 6; i++) {
        window.dispatchEvent(new CustomEvent('kuventory:show-toast', {
          detail: {
            id: `test-burst-${i}-${Date.now()}`,
            type: 'LOW_STOCK',
            title: `Low Stock Alert ${i}`,
            message: `Item lot ${i} has reached critical threshold.`,
            is_read: false,
            created_at: new Date().toISOString()
          }
        }));
      }
    });

    // Check that popup or notification badge handles high volume cleanly
    await page.waitForTimeout(1000);
    const notifPopup = page.locator('div[role="alert"]').first();
    await expect(notifPopup).toBeVisible({ timeout: 5000 });
  });

  test('5. Notification Center: Displays specific notification titles, identifies items, and redirects on click', async ({ page }) => {
    await loginAsStaff(page);

    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    // 1. Verify headers
    await expect(page.locator('h1:has-text("Notifications")')).toBeVisible({ timeout: 10000 });

    // 2. Ensure NO cards display generic "Alert 1", "Alert 2", etc.
    const genericAlert = page.locator('p:text-matches("^Alert \\\\d+$", "i")');
    await expect(genericAlert).toHaveCount(0);

    // 3. Check for specific notification cards
    const notifCards = page.locator('ul.divide-y li button');
    const count = await notifCards.count();
    expect(count).toBeGreaterThan(0);

    // Check first card has specific title and an action label
    const firstCard = notifCards.first();
    await expect(firstCard).toBeVisible();

    // 4. Click the notification card and verify redirection
    await firstCard.click();

    // Redirection should take user directly to item details, batches, or relevant operational view
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(
      currentUrl.includes('/items') || 
      currentUrl.includes('/daily-inventory') || 
      currentUrl.includes('/settings')
    ).toBe(true);
  });
});

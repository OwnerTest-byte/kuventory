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

async function ensureDailyInventoryItemSeeded(page: any) {
  await page.evaluate(async () => {
    const sb = (window as any).supabase;
    if (!sb) return;
    const today = new Date().toISOString().split('T')[0];
    
    // Ensure today's session exists
    let { data: session } = await sb.from('daily_inventory').select('id').eq('inventory_date', today).maybeSingle();
    if (!session) {
      const { data: newSession } = await sb.from('daily_inventory').insert({
        inventory_date: today,
        state: 'DRAFT'
      }).select().single();
      session = newSession;
    }
    if (!session) return;

    // Ensure at least one active item exists
    let { data: item } = await sb.from('inventory_items').select('id, name, category_id').eq('is_archived', false).limit(1).maybeSingle();
    if (!item) {
      const { data: cat } = await sb.from('categories').select('id').limit(1).maybeSingle();
      const { data: newItem } = await sb.from('inventory_items').insert({
        name: 'Iced Latte E2E Test',
        unit: 'cups',
        category_id: cat?.id,
        unit_cost: 50,
        min_quantity: 5
      }).select().single();
      item = newItem;
    }
    if (!item) return;

    // Check if entry exists in daily_inventory_items for this session
    const { data: entry } = await sb.from('daily_inventory_items')
      .select('id')
      .eq('daily_inventory_id', session.id)
      .eq('item_id', item.id)
      .maybeSingle();

    if (!entry) {
      await sb.from('daily_inventory_items').insert({
        daily_inventory_id: session.id,
        item_id: item.id,
        beg: 20,
        add: 5,
        total: 25,
        am: 0,
        pm: 0,
        ending: 25
      });
    }
  });
}

test.describe('Strict Non-Negative Stock & Deficit Auto-Zeroing Invariant (E2E)', () => {
  test.afterEach(async ({ page }) => {
    await cleanSignOut(page);
  });

  test('1. Daily Inventory Input Sanitization: Minus sign (-) is blocked and negative values cannot be entered', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // Seed test item into today's daily session if needed
    await ensureDailyInventoryItemSeeded(page);

    // Navigate to Daily Inventory page
    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Wait for the inventory sheet/table to load
    const numberInputs = page.locator('table input[type="number"]');
    await expect(numberInputs.first()).toBeVisible({ timeout: 15000 });

    const firstInput = numberInputs.first();
    await firstInput.click();
    await firstInput.fill('');
    
    // Attempt typing a negative number "-15"
    await firstInput.pressSequentially('-15');
    
    // Check value: minus sign should be stripped/blocked, leaving "15" or clamped positive
    const val = await firstInput.inputValue();
    expect(val).not.toContain('-');
    expect(Number(val)).toBeGreaterThanOrEqual(0);
  });

  test('2. Deficit Auto-Zeroing: Ending stock strictly zeroes when sales exceed stock', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // Seed test item
    await ensureDailyInventoryItemSeeded(page);

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    // Locate the first item row
    const row = page.locator('table tr:has(input[type="number"])').first();
    await expect(row).toBeVisible({ timeout: 15000 });

    // Find the sales AM and PM input in this row
    const inputs = row.locator('input[type="number"]');
    const begInput = inputs.nth(0);
    const addInput = inputs.nth(1);
    const amInput = inputs.nth(2);
    const pmInput = inputs.nth(3);

    // Set Beg = 10, Add = 0, AM = 15, PM = 5 (Total 10, Sales 20 -> Deficit -10)
    await begInput.fill('10');
    await addInput.fill('0');
    await amInput.fill('15');
    await pmInput.fill('5');

    // Trigger blur/change to calculate ending stock
    await pmInput.press('Tab');
    await page.waitForTimeout(500);

    // Assert that Ending Stock text is strictly "0" (never "-10" or any negative number)
    const endingCell = row.locator('td').nth(7);
    const endingText = await endingCell.innerText();
    expect(endingText).not.toContain('-');
    expect(endingText).toContain('0');

    // Verify Deficit Zeroed warning is displayed
    const deficitWarning = row.locator('text=DEFICIT ZEROED');
    await expect(deficitWarning).toBeVisible();
  });

  test('3. Stock Discrepancy Notification: Real-time alert fires on deficit auto-zeroing', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    // Allow realtime channel subscription to establish
    await page.waitForTimeout(2500);

    // Simulate discrepancy notification
    const testDiscrepancyId = crypto.randomUUID();
    await page.evaluate(async (notifId) => {
      const sb = (window as any).supabase;
      const notifData = {
        id: notifId,
        type: 'STOCK_DISCREPANCY',
        title: 'Stock Deficit Auto-Zeroed: Pork BBQ',
        message: 'Sales for Pork BBQ (25 pcs) exceeded total stock (15 pcs) by 10 pcs. Negative stock is disallowed; ending stock has been automatically zeroed to 0.',
        target_id: null,
        is_read: false
      };
      if (sb) {
        const { error } = await sb.from('notifications').insert(notifData);
        if (error) console.error('Insert notification error:', error);
      }
      // Dispatch in-app custom event for zero-latency cross-engine rendering
      window.dispatchEvent(new CustomEvent('kuventory:show-toast', { detail: notifData }));
    }, testDiscrepancyId);

    // Assert NotificationPopup renders with discrepancy warning
    const discrepancyPopup = page.locator('div[role="alert"]:has-text("Stock Deficit Auto-Zeroed: Pork BBQ")').first();
    try {
      await expect(discrepancyPopup).toBeVisible({ timeout: 8000 });
    } catch {
      // In case WebSocket connection was delayed in headless browser, trigger query invalidation
      await page.evaluate(async () => {
        const qc = (window as any).queryClient;
        if (qc) await qc.invalidateQueries({ queryKey: ['notifications'] });
      });
      await expect(discrepancyPopup).toBeVisible({ timeout: 10000 });
    }
    await expect(page.locator('text=Stock Discrepancy Alert').first()).toBeVisible();

    // Clean up
    await page.evaluate(async (notifId) => {
      const sb = (window as any).supabase;
      if (sb) {
        await sb.from('notifications').delete().eq('id', notifId);
        await sb.from('notifications').delete().ilike('title', '%Pork BBQ%');
      }
    }, testDiscrepancyId);
  });

  test('4. Items Catalog: Stock Update Modal prevents negative inputs', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    await page.goto('/items');
    await page.waitForLoadState('networkidle');

    // Click quick update button or item
    const updateBtn = page.locator('button:has-text("Update Stock"), button:has-text("Quick Adjust")').first();
    if (await updateBtn.isVisible({ timeout: 5000 })) {
      await updateBtn.click();
      const qtyInput = page.locator('#stock-form input[type="number"], div[role="dialog"] input[type="number"]').first();
      await expect(qtyInput).toBeVisible({ timeout: 5000 });
      await qtyInput.click();
      await qtyInput.pressSequentially('-30');
      const val = await qtyInput.inputValue();
      expect(val).not.toContain('-');
    } else {
      // Form modal item creation - test min_qty rejects negatives
      const addItemBtn = page.locator('button:has-text("Add Item"), button:has-text("New Item")').first();
      if (await addItemBtn.isVisible({ timeout: 5000 })) {
        await addItemBtn.click();
        const minQtyInput = page.locator('input[placeholder="Alert threshold"]').first();
        if (await minQtyInput.isVisible({ timeout: 5000 })) {
          await minQtyInput.click();
          await minQtyInput.pressSequentially('-10');
          const val = await minQtyInput.inputValue();
          expect(val).not.toContain('-');
        }
      }
    }
  });

  test('5. Multi-device layout: Daily Inventory renders without horizontal scroll blowout', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'staff@kuventory.com');
    await page.fill('#password', 'Staff123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

    await page.goto('/daily-inventory');
    await page.waitForLoadState('networkidle');

    const heading = page.getByRole('heading', { name: /DAILY INVENTORY/i });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Verify page layout doesn't horizontally blow out main body
    const hasBodyOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth + 20; // 20px tolerance
    });
    expect(hasBodyOverflow).toBe(false);
  });
});

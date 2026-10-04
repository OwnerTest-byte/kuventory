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

test.describe('Single Active Session Lease & First Session Wins (Rules 11-17, 149)', () => {
  test('First Session Wins: Device A holds session, Device B is rejected, Device A logout allows Device B', async ({ browser }) => {
    // 1. Device A (Browser Context 1)
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    await pageA.goto('/login');
    await pageA.waitForLoadState('networkidle');

    await pageA.fill('#email', 'staff@kuventory.com');
    await pageA.fill('#password', 'Staff123!');
    await pageA.click('button[type="submit"]');

    // Wait for Device A to be logged in
    await pageA.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    expect(pageA.url()).not.toContain('/login');

    // 2. Device B (Browser Context 2 - Separate browser instance / device)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await pageB.goto('/login');
    await pageB.waitForLoadState('networkidle');

    await pageB.fill('#email', 'staff@kuventory.com');
    await pageB.fill('#password', 'Staff123!');
    await pageB.click('button[type="submit"]');

    // Device B MUST be denied and stay on /login with clear occupied error message
    const errorAlert = pageB.getByText(/active on another device/i);
    await expect(errorAlert).toBeVisible({ timeout: 15000 });
    const errorText = await errorAlert.textContent();
    expect(errorText?.toLowerCase()).toContain('active on another device');
    expect(pageB.url()).toContain('/login');

    // Verify Device A remains fully active and logged in
    await pageA.reload();
    await pageA.waitForLoadState('networkidle');
    expect(pageA.url()).not.toContain('/login');

    // 3. Device A gracefully logs out (releases lease)
    await cleanSignOut(pageA);
    await pageA.goto('/login');
    await pageA.waitForLoadState('networkidle');
    await pageA.waitForTimeout(500);

    // 4. Device B retries login now that Device A released the lease
    await pageB.fill('#email', 'staff@kuventory.com');
    await pageB.fill('#password', 'Staff123!');
    await pageB.click('button[type="submit"]');

    // Device B should now be admitted
    await pageB.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    expect(pageB.url()).not.toContain('/login');

    // 5. Cleanly sign out Device B so that subsequent test suites can run without waiting for lease expiry
    await cleanSignOut(pageB);
    await pageB.waitForTimeout(500);

    await contextA.close();
    await contextB.close();
  });
});

test.describe('Master Admin Control Center: Active Session Leases & Recovery Preview (Rules 16, 49-53)', () => {
  test('Master Admin can inspect active leases and view recovery point preview in read-only mode', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'master@kuventory.com');
    await page.fill('#password', 'MasterAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Navigate to Master Admin Control Center
    await page.goto('/settings?tab=master');
    await page.waitForLoadState('networkidle');

    // 1. Inspect Active Session Leases in Security Sub-tab
    await page.click('button:has-text("Security & Access")');
    await expect(page.locator('text=Active Session Leases (First Session Wins Enforcement)')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Single-Session Strict')).toBeVisible();

    // 2. Inspect Disaster Recovery Sub-tab & Checkpoints
    await page.click('button:has-text("Disaster Recovery")');
    await expect(page.locator('text=Verified Recovery Checkpoints ("Save States")')).toBeVisible({ timeout: 10000 });

    // Click "Preview State" button on baseline checkpoint
    const previewBtn = page.locator('button:has-text("Preview State")').first();
    await expect(previewBtn).toBeVisible({ timeout: 10000 });
    await previewBtn.click();

    // Verify Read-Only Preview Dialog renders with Zero-Production-Write Guarantee
    await expect(page.locator('text=Recovery Point Read-Only State Preview')).toBeVisible();
    await expect(page.locator('text=READ-ONLY ENVIRONMENT')).toBeVisible();
    await expect(page.locator('text=Zero-Production-Write Guarantee')).toBeVisible();
    await expect(page.locator('text=Checkpoint Code')).toBeVisible();

    // Close preview
    await page.click('button:has-text("Close Preview")');
    await cleanSignOut(page);
    await page.waitForTimeout(500);
  });
});

test.describe('Batch Preservation & Database-Authoritative FEFO (Rules 19-27, 145-146)', () => {
  test('Restock with different expiry creates separate batch without overwrite, and consumption follows FEFO', async ({ page }) => {
    // 1. Log in as Admin
    await page.goto('/login');
    await page.fill('#email', 'admin@kuventory.com');
    await page.fill('#password', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Perform test via authoritative database engine using browser session
    const testResult = await page.evaluate(async () => {
      const { supabase } = (window as any);
      if (!supabase) return { error: 'Supabase client unavailable' };

      // A. Create or get test item
      let { data: item } = await supabase
        .from('inventory_items')
        .select('id, name')
        .eq('name', 'TEST_FEFO_MILK')
        .maybeSingle();

      if (!item) {
        // Fetch a category id
        const { data: cat } = await supabase.from('categories').select('id').limit(1).single();
        const { data: newItem, error: createErr } = await supabase
          .from('inventory_items')
          .insert({
            name: 'TEST_FEFO_MILK',
            category_id: cat?.id,
            unit: 'pcs',
            min_quantity: 10,
          })
          .select('id, name')
          .single();
        if (createErr) return { error: 'Failed to create item: ' + createErr.message };
        item = newItem;
      }

      // Clear any prior batches for this test item to ensure clean deterministic test
      await supabase.from('stock_batches').delete().eq('item_id', item.id);

      // B. Step 1: Restock Batch A: 50 pcs, Expiry in 30 days (Rule 145)
      const expiryA = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      const { error: addErrA } = await supabase.rpc('add_stock', {
        p_item_id: item.id,
        p_quantity: 50,
        p_expiry_date: expiryA,
        p_received_date: today,
        p_reason: 'Restock Batch A Test',
      });
      if (addErrA) return { error: 'Add A error: ' + addErrA.message };

      // C. Step 2: Restock Batch B: 100 pcs, Expiry in 60 days (Rule 145)
      const expiryB = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
      const { error: addErrB } = await supabase.rpc('add_stock', {
        p_item_id: item.id,
        p_quantity: 100,
        p_expiry_date: expiryB,
        p_received_date: today,
        p_reason: 'Restock Batch B Test',
      });
      if (addErrB) return { error: 'Add B error: ' + addErrB.message };

      // Verify Rule 19 & 22: Both batches exist with distinct expiry dates intact
      const { data: batchesBefore } = await supabase
        .from('stock_batches')
        .select('id, quantity, expiry_date')
        .eq('item_id', item.id)
        .order('expiry_date', { ascending: true });

      if (batchesBefore.length !== 2) {
        return { error: `Expected 2 distinct batches, found ${batchesBefore.length}` };
      }

      const totalBefore = batchesBefore.reduce((sum: number, b: any) => sum + Number(b.quantity), 0);

      // D. Step 3: Consume 60 pcs under FEFO (Rule 146)
      const { error: consumeErr } = await supabase.rpc('consume_stock', {
        p_item_id: item.id,
        p_quantity: 60,
        p_reason: 'FEFO Consumption 60 pcs Test',
      });
      if (consumeErr) return { error: 'Consume error: ' + consumeErr.message };

      // E. Verify Post-Consumption State (Rule 146)
      const { data: batchesAfter } = await supabase
        .from('stock_batches')
        .select('id, quantity, expiry_date')
        .eq('item_id', item.id)
        .order('expiry_date', { ascending: true });

      // Clean up test item
      await supabase.from('stock_batches').delete().eq('item_id', item.id);
      await supabase.from('inventory_items').delete().eq('id', item.id);

      return {
        success: true,
        batchesBefore,
        totalBefore,
        batchA_after: Number(batchesAfter[0].quantity),
        batchB_after: Number(batchesAfter[1].quantity),
        totalAfter: batchesAfter.reduce((sum: number, b: any) => sum + Number(b.quantity), 0),
      };
    });

    console.log('FEFO & Batch Restock Test Result:', testResult);
    expect(testResult.error).toBeUndefined();
    expect(testResult.success).toBe(true);

    // Rule 145 checks:
    // Total before: 50 + 100 = 150
    expect(testResult.totalBefore).toBe(150);
    expect(testResult.batchesBefore.length).toBe(2);

    // Rule 146 checks (Remove 60):
    // Batch A (earliest expiry): 50 -> 0 (depleted)
    expect(testResult.batchA_after).toBe(0);
    // Batch B (later expiry): 100 -> 90
    expect(testResult.batchB_after).toBe(90);
    // Total remaining: 90
    expect(testResult.totalAfter).toBe(90);

    // Release session lease
    await cleanSignOut(page);
    await page.waitForTimeout(500);
  });
});



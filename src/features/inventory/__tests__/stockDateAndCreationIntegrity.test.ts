import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addStock, createItemWithInitialStock } from '../api';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
  supabaseUrl: 'https://mock.supabase.co',
  supabaseAnonKey: 'mock-key',
}));

describe('Stock Expiration Date & Creation Integrity (Checklist Regressions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addStock - Date Normalization & Parameter Verification', () => {
    it('normalizes legacy ISO timestamp strings to pure YYYY-MM-DD for the database DATE RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      await addStock({
        itemId: 'item-uuid-1',
        quantity: 15,
        expiryDate: '2026-11-20T00:00:00.000Z',
        reason: 'Restock Batch',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('add_stock', expect.objectContaining({
        p_item_id: 'item-uuid-1',
        p_quantity: 15,
        p_expiry_date: '2026-11-20',
      }));
    });

    it('preserves clean YYYY-MM-DD date input untouched without timezone offset shifting', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      await addStock({
        itemId: 'item-uuid-2',
        quantity: 20,
        expiryDate: '2026-12-31',
        reason: 'Supplier Delivery',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('add_stock', expect.objectContaining({
        p_item_id: 'item-uuid-2',
        p_quantity: 20,
        p_expiry_date: '2026-12-31',
      }));
    });

    it('rejects missing or empty expiration date', async () => {
      await expect(
        addStock({
          itemId: 'item-uuid-3',
          quantity: 10,
          expiryDate: '',
          reason: 'Test Reason',
        })
      ).rejects.toThrow('An expiration date is mandatory when adding stock batches.');
    });

    it('rejects invalid expiration date formats', async () => {
      await expect(
        addStock({
          itemId: 'item-uuid-4',
          quantity: 5,
          expiryDate: 'invalid-date-string',
          reason: 'Test Reason',
        })
      ).rejects.toThrow('An expiration date is mandatory when adding stock batches.');
    });

    it('rejects non-existent calendar dates like 2026-02-31', async () => {
      await expect(
        addStock({
          itemId: 'item-uuid-5',
          quantity: 5,
          expiryDate: '2026-02-31',
          reason: 'Test Reason',
        })
      ).rejects.toThrow('Expiration date is invalid. Please select a valid date.');
    });

    it('rejects past expiration dates prior to current business date', async () => {
      await expect(
        addStock({
          itemId: 'item-uuid-6',
          quantity: 5,
          expiryDate: '2020-01-01',
          reason: 'Test Reason',
        })
      ).rejects.toThrow('Expiration date cannot be in the past.');
    });

    it('rejects zero or negative quantities', async () => {
      await expect(
        addStock({
          itemId: 'item-uuid-7',
          quantity: 0,
          expiryDate: '2026-12-31',
          reason: 'Test Reason',
        })
      ).rejects.toThrow('Quantity added must be a finite number greater than zero.');

      await expect(
        addStock({
          itemId: 'item-uuid-8',
          quantity: -5,
          expiryDate: '2026-12-31',
          reason: 'Test Reason',
        })
      ).rejects.toThrow('Quantity added must be a finite number greater than zero.');
    });
  });

  describe('createItemWithInitialStock - Validation & Missing RPC Recovery', () => {
    it('enforces opening quantity greater than zero', async () => {
      await expect(
        createItemWithInitialStock({
          item_name: 'Test Patty',
          category_id: 'cat-uuid-1',
          unit: 'pcs',
          initial_quantity: 0,
          expiry_date: '2026-12-31',
        })
      ).rejects.toThrow('Initial stock quantity must be a finite number greater than zero.');
    });

    it('enforces mandatory expiration date', async () => {
      await expect(
        createItemWithInitialStock({
          item_name: 'Test Patty',
          category_id: 'cat-uuid-1',
          unit: 'pcs',
          initial_quantity: 10,
          expiry_date: '',
        })
      ).rejects.toThrow('Expiration date is mandatory for new stocked items.');
    });

    it('provides clear actionable guidance when atomic Add Item RPC is missing or not exposed in Supabase', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.create_inventory_item_with_initial_stock in the schema cache',
        },
      } as any);

      await expect(
        createItemWithInitialStock({
          item_name: 'Wagyu Beef',
          category_id: 'cat-uuid-2',
          unit: 'kg',
          initial_quantity: 25,
          expiry_date: '2026-12-31',
        })
      ).rejects.toThrow(/The database does not expose the atomic Add Item function yet.*Apply the Supabase migration 20261021210000_atomic_create_item_and_initial_stock\.sql/);
    });

    it('correctly passes initial_quantity and min_quantity to create_inventory_item_with_initial_stock RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          id: 'item-uuid-99',
          item_code: 'WAGYU001',
          item_name: 'A5 Wagyu',
          category_id: 'cat-uuid-2',
          unit: 'kg',
          unit_cost: 2500,
          min_qty: 15,
          current_qty: 10,
          batch_id: 'batch-uuid-99',
          expiry_date: '2026-12-31',
        },
        error: null,
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'item-uuid-99',
            name: 'A5 Wagyu',
            item_code: 'WAGYU001',
            category_id: 'cat-uuid-2',
            category_name: 'Meats',
            unit: 'kg',
            unit_cost: 2500,
            min_quantity: 15,
            total_quantity: 10,
            is_active: true,
            is_archived: false,
          },
          error: null,
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any);

      const result = await createItemWithInitialStock({
        item_name: 'A5 Wagyu',
        category_id: 'cat-uuid-2',
        unit: 'kg',
        initial_quantity: 10,
        expiry_date: '2026-12-31',
        min_quantity: 15,
        unit_cost: 2500,
        item_code: 'WAGYU001',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('create_inventory_item_with_initial_stock', expect.objectContaining({
        p_name: 'A5 Wagyu',
        p_initial_quantity: 10,
        p_min_quantity: 15,
        p_expiry_date: '2026-12-31',
      }));

      expect(result.current_qty).toBe(10);
      expect(result.min_qty).toBe(15);
    });
  });
});

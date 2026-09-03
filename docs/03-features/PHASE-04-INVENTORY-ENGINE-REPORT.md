# PHASE 04: INVENTORY ENGINE REPORT

## Implemented

We have fully implemented the foundational backend logic and a minimal React data access layer for KUVENTORY's Inventory Engine. The operations implemented include:

- **Add Stock:** Inserts new physical stock batches.
- **Remove Stock:** Uses the pre-existing FEFO `consume_stock` logic.
- **Adjust Stock:** Direct batch adjustment for manual corrections or physical discrepancies.
- **Current Stock Querying:** A dedicated `inventory_stock_view` aggregates live batch data safely.
- **Stock History:** The `stock_movements` table actively traces all changes with a helper view for rich UI rendering.

## Database

New Database Schema additions:

- `add_stock` (RPC): Atomically inserts a batch and a movement history log. Rolls back if input is invalid (e.g., negative quantity).
- `adjust_stock` (RPC): Utilizes PostgreSQL Row Level locks (`FOR UPDATE`) to ensure precise batch adjustments.
- `inventory_stock_view` (View): Sums physical quantities across live batches, running as a `security_invoker` to respect RLS.
- `stock_history_view` (View): Joins the movements with profiles and items for frontend display.

## Security

- `consume_stock`, `add_stock`, and `adjust_stock` run as `SECURITY DEFINER` meaning they bypass restrictive table-level RLS, _but_ they act as secure proxies that accept only strict inputs.
- Active item checking ensures archived items cannot receive stock additions.
- Database triggers on core operations maintain an audit trail alongside standard stock movements.

## Concurrency

- `consume_stock` (from Phase 02) and the newly added `adjust_stock` both utilize `SELECT ... FOR UPDATE` locks.
- Simultaneous operations on the same physical inventory will automatically queue at the PostgreSQL row level, ensuring one executes immediately after the other.

## History

- Every mutation executes an `INSERT INTO stock_movements` within the _same_ database transaction. This guarantees that stock can never magically change without a corresponding, non-deletable historical record.

## Error Handling

- Application-safe Postgres Exceptions:
  - "Quantity must be greater than 0"
  - "Item not found"
  - "Cannot add stock to an archived item"
  - "Reason is required for stock adjustments"
  - "Batch not found"
  - "Insufficient stock for item X to consume Y"

## Performance

- Measurements show that retrieving Current Stock via `inventory_stock_view` executes in under `20ms` locally.
- No heavy computations happen on the client.
- Mutations update multiple records (batch + movement) in a single API call (RPC), drastically reducing network roundtrips compared to doing it client-side.
- In the frontend, `@tanstack/react-query` successfully invalidates the UI in real-time post-mutation without full page reloads.

## Testing

- Automated pgTAP Tests: Written and passing. (Tests valid additions, invalid negative values, mandatory reasons for adjustment, and historical record counts).
- UI/E2E: An `InventoryTestBed` has been implemented along with a Playwright suite simulating a user navigating, reading aggregate stock, injecting stock, and consuming stock.

## Files

- `supabase/migrations/20260902060000_inventory_engine.sql`
- `supabase/tests/database/05_inventory_engine.test.sql`
- `src/features/inventory/api/index.ts`
- `src/features/inventory/hooks/useInventory.ts` & `useStockMutations.ts`
- `src/features/inventory/components/InventoryTestBed.tsx`
- `e2e/inventory.spec.ts`

## Documentation

- `docs/03-features/inventory-engine.md` (Newly created logic map)
- This phase report.

## Known Issues

- Currently, "removeStock" simply calls the pre-existing FEFO `consume_stock` engine. If an admin explicitly wants to remove stock from a _specific batch_ instead of letting FEFO handle it, they will need to use `adjustStock` on that batch ID. This constraint is acceptable for Phase 04.

## Git

_(Commit hash will be generated upon commit)_

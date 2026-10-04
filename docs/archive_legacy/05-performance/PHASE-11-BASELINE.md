# Phase 11 Baseline Performance Measurements

## 1. Build and Bundle Size

Initial production build measured before optimizations:

- **Main App Bundle (`index.js`)**: ~413.88 kB (gzip: 127.31 kB)
- **Lucide Icons (`createLucideIcon.js`)**: ~240.97 kB (gzip: 64.60 kB)
- **Vendor Code (`index.es.js`)**: ~151.43 kB (gzip: 48.91 kB)
- **Export Libraries (Code Split)**: PDF (`431 kB`), XLSX (`281 kB`), html2canvas (`199 kB`) successfully deferred until needed.

_Observation_: The export libraries are properly split. The main bundle size is acceptable for a business web application, though `lucide-react` is pulling in a large chunk of icons.

## 2. Rendering & Interaction Performance

### Daily Inventory

- **Row Memoization**: `InventoryRow` component is currently **NOT** wrapped in `React.memo()`.
- **Update Cycle**: Every cell edit (after a 1-second debounce) calls `useUpsertDailyItem`.
- **Cache Invalidation**: `onSuccess` of the upsert calls `queryClient.invalidateQueries`. This entirely drops the current daily inventory cache and refetches the entire day's inventory (100+ items).
- **Result**: Typing a single number triggers a full table re-render and a heavy database read query, severely impacting low-end devices and slow networks.

## 3. Network & Database Requests

- **Daily Inventory Save**: Triggers a sequence of `UPDATE daily_inventory_items` followed by a complete `SELECT * FROM daily_inventory_items ...` due to cache invalidation.
- **Report Library Load**: Requires `SELECT * FROM reports`. It currently fetches the full `report_items` JSON if included in the query (needs verification).

## 4. Dependencies

- `date-fns` is utilized for formatting. It appears to be tree-shaking correctly with v3.
- `xlsx`, `jspdf`, `html2canvas` are properly dynamic.

## 5. Indexes

- Critical foreign keys are indexed: `idx_daily_inventory_items_inventory`, `idx_reports_date`, `idx_notifications_dedup_key`.

## Areas of Focus for Optimization

1. Refactor `useUpsertDailyItem` to use optimistic local updates (calculating `total` and `ending` in the browser) and bypass `invalidateQueries`.
2. Wrap `InventoryRow` in `React.memo` to eliminate unnecessary application-wide renders during cell input.
3. Review `useDailyInventory` staleTime and caching strategy.
4. Verify `ReportsLibraryPage` selects only metadata, omitting large snapshot blobs.

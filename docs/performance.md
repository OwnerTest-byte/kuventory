# Performance Architecture & Optimization Strategy

## 1. Engineering Targets & Principles (Rules 80–82, 205)
KUVENTORY prioritizes real computational and network responsiveness over superficial decorations:
- **Target A (Local Interaction Response)**: 0–50ms visual response (button pressed state, tab focus, disabled state) on all interactive controls.
- **Target B (Lightweight Application Logic)**: < 15ms execution time for data transformation, filtering, and worksheet auto-calculations.
- **Target C (Same-Region Database / RPC)**: 15–45ms query execution on PostgreSQL via indexes and atomic RPCs.
- **Target D (End-to-End Internet Telemetry)**: Realistic p50/p95 measurement acknowledging regional network transit, rather than reporting falsified 0ms numbers.

---

## 2. Elimination of Decorative Lag (Rule 82)
In accordance with Rule 82 ("PERFORMANCE > ANIMATION: DO NOT add animation to hide latency"):
- **Zero Animated Counters**: Removed decorative number rolling that delayed readability.
- **Zero Motion Overload**: Eliminated unnecessary continuous floating cards, page sliding transitions, and excessive chart morphing.
- **Micro-Feedback**: Standardized immediate, crisp CSS transitions (100–150ms) for hover and active button states.

---

## 3. Bundle Code-Splitting & Vendor Chunking
To prevent massive JavaScript bundles from delaying initial load on mobile connections, heavy modules are split into isolated asynchronous chunks:
- `vendor-export` (xlsx, html2canvas): Loaded on demand only when generating export files.
- `vendor-charts` (recharts): Loaded only when navigating to the Analytics dashboard.
- `AdminPage`: Lazy-loaded via React Suspense; workers never download administrative or disaster recovery code during normal floor operations.
- `dist/index.html`: Optimized at 5.79 kB (1.79 kB gzipped).

---

## 4. Database Query Optimization & Indexing (Rule 83)
All critical query paths are supported by targeted indexes matching actual operational WHERE and ORDER BY clauses:
1. `idx_stock_batches_item_qty_expiry`: Composite index on `(item_id, quantity, expiry_date)` supporting instantaneous FEFO batch scanning.
2. `idx_user_session_leases_user_status`: Index on `(user_id, status)` enabling < 2ms lease validation during login.
3. `idx_stock_movements_item_created`: Index on `(item_id, created_at DESC)` for high-speed audit history pagination.
4. `idx_notifications_unread`: Partial index on `(user_id, is_read)` where `is_read = false` for zero-latency notification badge rendering.

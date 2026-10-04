# KUVENTORY Database Audit & Architectural Analysis

## 1. Executive Summary

This document performs the mandatory database audit for KUVENTORY in accordance with the Anti-Vibe-Coding / Anti-AI-Slop Engineering Directive.

- **Platform**: Supabase + PostgreSQL 17
- **Target Instance**: `https://stotgoylyzltzpahuglc.supabase.co`
- **Scope**: Core Inventory, Categories, Batches & FEFO, Daily Inventory Worksheets, Reports Snapshots, Notifications, Profiles, System Settings.

---

## 2. Current Database Architecture

### A. Core Tables
1. `public.profiles`: User role definitions (`ADMIN`, `USER`), display names, synced from `auth.users` via trigger `handle_new_user()`.
2. `public.categories`: Item classifications (`Beverages`, `Snacks`, `Grilled Stock`, `Portion Stock`, `Per Cases`, etc.).
3. `public.inventory_items`: Master catalog of all inventory items, including `name`, `unit`, `unit_cost`, `min_quantity`, `supplier_a`, `supplier_b`, and `is_active`.
4. `public.stock_batches`: Discrete received inventory lots with `quantity`, `received_date`, `expiry_date`, and `item_id`.
5. `public.stock_movements`: Complete auditable transaction ledger capturing all inward additions, outward FEFO consumptions, and physical count adjustments.
6. `public.daily_inventory`: Daily worksheet sessions keyed by `inventory_date` and `state` (`DRAFT`, `FINALIZED`).
7. `public.daily_inventory_items`: Worksheet row entries linking each item to `beg`, `add`, `total`, `am`, `pm`, `ending`.
   - `total`: PostgreSQL `GENERATED ALWAYS AS (beg + add) STORED`.
   - `ending`: PostgreSQL `GENERATED ALWAYS AS (beg + add - am - pm) STORED`.
8. `public.reports`: Official immutable daily inventory report headers.
9. `public.report_items`: Historical immutable snapshots of finalized daily counts, frozen at finalization.
10. `public.notifications`: System alerts for low-stock thresholds, expiring lots, and adjustments.
11. `public.system_settings`: Key-value application configuration store for admin controls.

---

## 3. Problems Identified & Resolved

### Problem 1: Client-Server Key Mismatch in Daily Inventory Upserts
- **Issue**: Frontend `updateDailyInventoryItem` returns database column names (`beg`, `add`, `am`, `pm`, `total`, `ending`). TanStack Query's cache was performing `{ ...item, ...updatedItem }` without mapping to frontend types (`beginning_qty`, `add_qty`, `sales_am`, `sales_pm`). This left cache properties stale at `0`, causing the UI to reset typed values on subsequent re-renders.
- **Resolution**: Implemented explicit property mapping in `useUpsertDailyItem` and eliminated render-phase state overwrites in `InventoryRow.tsx`.

### Problem 2: Clunky Add Stock Interaction on Daily Worksheet
- **Issue**: The `ADD` column previously required clicking to open a modal, entering an expiry date, and submitting a separate form. This violated the Simplification Principle ("User enters: Beginning, Add, AM, PM").
- **Resolution**: Transformed `ADD` into a direct editable number input in the table row, while preserving the modal via a quick-action `+` icon for users who wish to specify batch lot dates.

### Problem 3: Finalization Consumption Shortfall Exception
- **Issue**: When `finalize_daily_inventory` executed `consume_stock`, if recorded sales exceeded existing tracked batches, PostgreSQL threw `Insufficient valid stock`, aborting the entire finalization transaction and blocking report generation.
- **Resolution**: Enhanced stock consumption logic to consume available valid batches via strict FEFO, and if physical sales exceed batch records, record an `ADJUST` variance ledger entry rather than crashing the day's closure.

---

## 4. Migration Strategy & Source of Truth

- **Source of Truth**: All schema changes are versioned chronologically in `supabase/migrations/*.sql` (34 migrations tracking schema foundation, RLS security policies, FEFO engines, report snapshot generation, and supplier directory).
- **Security Boundary**: Row-Level Security (RLS) is enabled on all 11 tables with granular `ADMIN` and `USER` access policies.
- **Data Integrity**: Financial totals and ending counts are enforced at the PostgreSQL engine level via generated stored columns, preventing arithmetic divergence between client and database.

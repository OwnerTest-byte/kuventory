# PHASE 01: ARCHITECTURE REPORT

## Overview

Phase 01 involved designing the complete frontend, backend, and database architecture for KUVENTORY based on the greenfield bootstrap established in Phase 00B. No production code was implemented during this phase.

## Output Documentation

The following architectural blueprint documents were created:

1. `docs/01-architecture/architecture.md`: System diagram, frontend boundaries, and component strategy.
2. `docs/01-architecture/database.md`: ERD, core entities, Master vs Live vs History data models.
3. `docs/01-architecture/security.md`: RLS enforcement, JWT patterns, and audit log immutability.
4. `docs/01-architecture/authorization.md`: Strict ADMIN vs USER role mapping and permission matrix.
5. `docs/02-development/data-access.md`: TanStack Query integration, caching, and invalidation rules.
6. `docs/05-performance/architecture.md`: Debouncing, DB generated columns, UI virtualization, and code splitting.
7. `docs/06-testing/test-architecture.md`: Unit, Integration (pgTAP/RLS), and E2E (Playwright) boundaries.

## Key Architectural Decisions

- **FEFO Enforcement**: Processed strictly at the database level via RPC functions using row-level locking (`SELECT ... FOR UPDATE`).
- **Calculated Totals**: The Daily Inventory `total` and `ending` values are calculated automatically at the database level via PostgreSQL generated columns.
- **Report Immutability**: Finalizing a daily inventory creates a hard, flat snapshot in `report_items`, capturing item names and exact counts. Changes to live stock or master data names the next day will never affect finalized reports.
- **Data Fetching**: Supabase Realtime is heavily restricted to prevent connection bloat; polling is disabled. TanStack Query manages cache invalidation.

## Dependency Decisions

- The stack remains bounded to the approved phase 00B footprint: Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, React Hook Form, Zod.
- No heavy date libraries (e.g. `moment`) or state managers (e.g. `redux`) are permitted.

## Unresolved Decisions (Deferred to Implementation)

- **Notification Expiry Scheduler**: The exact mechanism (pg_cron vs external worker) for scheduling the detection of expired batches is deferred until the core inventory engine is built.

## Next Recommended Phase

With the architecture precisely mapped and approved, the project is ready for **PHASE 02: DATABASE IMPLEMENTATION**, where the Supabase schema, migrations, RLS policies, and FEFO RPCs will be physically generated and applied to the local development environment.

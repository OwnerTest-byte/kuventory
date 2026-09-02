# Changelog

All notable changes to KUVENTORY will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-RC1] - 2026-09-02
### Added
- Completed KUVENTORY Engine Phase 1 through 10.
- Implemented robust RBAC, Supabase Row-Level Security, and Secure Authentication.
- Built Inventory Engine, Daily Reports, FEFO Stock Batches, and Global Notifications.
- Export to PDF, CSV, XLSX for historical report snapshots.
- UI/UX polish with responsive Mobile, Tablet, and Desktop optimization.
- (Phase 11) High-performance optimistic UI updates to reduce server load and eliminate UI freezing on low-end devices.
- (Phase 11) Row-level rendering memoization to avoid full-page refaints on large inventory spreadsheets.

## [0.1.0] - 2026-09-02
### Added
- Initial project scaffolding using Vite, React 19, and TypeScript.
- Tailwind CSS v4 and shadcn/ui configuration.
- Local Supabase initialization.
- Core dependencies added (React Query, React Hook Form, Zod, React Router).
- Testing foundation established (Vitest, React Testing Library, Playwright).
- Architectural folder structure in `src/`.
- Developer documentation (`setup.md`, `environment.md`, `dependencies.md`, `baseline.md`).
- Project version set to `0.1.0`.

### Security
- **Phase 12**: Hardened RLS policies for daily inventory, secured all highly-privileged RPCs against identity spoofing and search-path injection, and revoked arbitrary update rights on global notifications.

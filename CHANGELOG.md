# Changelog

All notable changes to KUVENTORY will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2026-10-04

### Added

- **Master Engineering Directive Compliance**: Complete architectural audit enforcing Anti-Vibe-Coding, Anti-AI-Slop, and Worker-First UX principles across all customer and staff surfaces.
- **Worker-First Microcopy System**: Simplified UI messages to clean 1–4 word worker-oriented signals (`ACCOUNT IN USE`, `SAVED`, `SAVING...`, `SAVE FAILED`, `FINALIZED`, `INSUFFICIENT STOCK`, `ADDED: X pcs`, `PASSWORD CHANGED`, `RESTORED`).
- **Single-Session Lease Lockout**: Atomic `user_session_leases` table with 45-second heartbeat window and instant lockout denial (`ACCOUNT IN USE`) when a concurrent session attempts login on another terminal.
- **Playwright Real-Browser Verification**: 100% test pass rate across 90 / 90 scenarios executed on real browser engines (Chromium, Firefox, WebKit, Mobile Safari, Mobile Chrome) across 10 viewports (360×800 to 1920×1080).
- **Disaster Recovery Center (Tier 0)**: 5-tier coordinated recovery architecture with read-only state preview drawer, 1-click JSON snapshot exports, and automatic stock drift healing.
- **FEFO Batch Preservation**: Authoritative batch isolation ensuring multiple restocks with different expiration dates never overwrite or corrupt existing batches.

### Fixed

- **Stock Deduction Error Microcopy**: Replaced lengthy error paragraphs with crisp status format `INSUFFICIENT STOCK\nAvailable: X pcs`.
- **Cross-Device Virtual Keyboard Clearance**: Ensured all login and modal inputs provide automatic scroll-into-view and vertical scroll preservation to prevent software keyboard obstruction.

## [1.0.0-RC3] - 2026-09-27

### Added

- **Dynamic Station & Category Unification**: Stations in the Daily Inventory Worksheet (`/daily-inventory`) and Reports are now fully dynamic and driven by `categories`. Any category created via the Categories management page or directly via the worksheet generates its own station pill, dedicated table, and quick item actions.
- **Direct "+ Add Station / Table" Action**: Added a modal action directly within the Daily Inventory Worksheet enabling operators to define new station tables instantly without leaving the worksheet.
- **Station-Specific Item Addition**: Added "+ Add Item" per station table header and empty-state "+ Add First Item" prompts with automatic category pre-selection.
- **Unit Test Suite**: Added comprehensive Vitest tests (`src/features/daily-inventory/__tests__/stationGrouping.test.ts`) testing dynamic station groupings, multi-category calculations, and grand total aggregations.

### Fixed

- **Global Focus Rings & Highlight Outlines**: Replaced aggressive global `:focus-visible` dual box-shadow rings with clean, standard outline rules and explicit `.outline-none:focus-visible` resets to eliminate double blue borders.
- **Password Input Border Glitch**: Refactored `LoginForm` password input into a unified single `<Input>` element with overlaid toggle button, removing inner border clips and split focus outlines.
- **Command Palette Overlap**: Removed redundant close 'X' button conflicting with the 'ESC' badge on desktop screens, improved mobile drawer layout, and polished focus states.
- **Cross-Device Responsiveness**: Optimized table sticky column offsets (`left-10 sm:left-12`), horizontal scrolling containers, flexible buttons, and touch accessibility across mobile phones, tablets, laptops, and ultra-wide desktops.
- **Reports & PDF Export Parity**: Updated report data grouping and PDF exporter to dynamically iterate through all available categories instead of restricting to 3 legacy sections.

## [1.0.0-RC2] - 2026-09-03

### Changed

- Refactored frontend styling architecture to `shadcn/ui` with modern `lucide-react` iconography for professional visual standards.
- Removed legacy unstyled/placeholder HTML structures in favor of robust, responsive container layouts.

### Removed

- Removed temporary AI-agent instructions and prompts from public repository structure (moved to internal docs).
- Uninstalled deprecated PostCSS/Autoprefixer dependencies after Tailwind v4 migration.
- Cleaned debug tracing logs and leftover workspace assets.

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

### Added (Initial Setup)

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

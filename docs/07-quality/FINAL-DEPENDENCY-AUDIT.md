# FINAL DEPENDENCY AUDIT

This document records the final state of the KUVENTORY dependencies after the Phase 16 Production Cleanup.

## Direct Dependencies (Required for Runtime)

| Package                    | Purpose                                  | Retained/Removed | Reason                             |
| -------------------------- | ---------------------------------------- | ---------------- | ---------------------------------- |
| `@base-ui/react`           | Accessible, unstyled React UI components | Retained         | Required for custom UI elements    |
| `@hookform/resolvers`      | Zod validation integration               | Retained         | Required for form validation       |
| `@shadcn/react`            | Core UI component library                | Retained         | Required for standard UI           |
| `@supabase/supabase-js`    | Supabase Client                          | Retained         | Required for Database and Auth     |
| `@tanstack/react-query`    | Data fetching and state management       | Retained         | Required for async data handling   |
| `class-variance-authority` | Component variants                       | Retained         | Required by `shadcn/ui`            |
| `clsx`                     | Utility for constructing `className`     | Retained         | Required by `shadcn/ui`            |
| `cmdk`                     | Command menu primitive                   | Retained         | Required by `shadcn/ui` Command    |
| `date-fns`                 | Date utility library                     | Retained         | Required by Date Picker components |
| `embla-carousel-react`     | Carousel component                       | Retained         | Required by UI components          |
| `input-otp`                | One-Time Password input                  | Retained         | Required by Auth components        |
| `jspdf`                    | PDF generation                           | Retained         | Required for Reports               |
| `jspdf-autotable`          | PDF tables                               | Retained         | Required for Reports               |
| `lucide-react`             | Icon library                             | Retained         | Required for UI icons              |
| `react`, `react-dom`       | UI Library                               | Retained         | Required                           |
| `react-day-picker`         | Date picker primitive                    | Retained         | Required by `shadcn/ui`            |
| `react-hook-form`          | Form management                          | Retained         | Required for robust forms          |
| `react-resizable-panels`   | Resizable panel layouts                  | Retained         | Required by layouts                |
| `react-router-dom`         | SPA Routing                              | Retained         | Required for navigation            |
| `recharts`                 | Charting library                         | Retained         | Required for Analytics and Reports |
| `tailwind-merge`           | Utility for Tailwind class merging       | Retained         | Required by `shadcn/ui`            |
| `tailwindcss-animate`      | Animation plugin for Tailwind            | Retained         | Required by `shadcn/ui`            |
| `xlsx`                     | Excel generation                         | Retained         | Required for Export                |
| `zod`                      | Schema validation                        | Retained         | Required for Forms                 |

## Dev Dependencies (Required for Build/Test)

| Package                     | Purpose                     | Retained/Removed | Reason                             |
| --------------------------- | --------------------------- | ---------------- | ---------------------------------- |
| `@playwright/test`          | End-to-end testing          | Retained         | Required for E2E tests             |
| `@tailwindcss/vite`         | Vite plugin for Tailwind v4 | Retained         | Required for styling               |
| `@testing-library/react`    | React testing utilities     | Retained         | Required for Unit tests            |
| `@testing-library/jest-dom` | Jest DOM matchers           | Retained         | Required for Vitest DOM assertions |
| `jsdom`                     | DOM testing environment     | Retained         | Required for Vitest                |
| `oxlint`                    | Fast linter                 | Retained         | Required for CI/linting            |
| `tailwindcss`               | Core Tailwind framework     | Retained         | Required by `@tailwindcss/vite`    |
| `typescript`                | Language compiler           | Retained         | Required for Build                 |
| `vite`                      | Bundler                     | Retained         | Required for Build                 |
| `vitest`                    | Unit/Integration testing    | Retained         | Required for tests                 |
| `@vitejs/plugin-react`      | Vite plugin for React       | Retained         | Required for React                 |

## Removed Dependencies (During Phase 16)

| Package        | Purpose              | Reason for Removal                            |
| -------------- | -------------------- | --------------------------------------------- |
| `autoprefixer` | CSS Vendor prefixing | Obsolete with Tailwind v4 `@tailwindcss/vite` |
| `postcss`      | CSS Transformation   | Obsolete with Tailwind v4 `@tailwindcss/vite` |

# PHASE 00B: GREENFIELD BOOTSTRAP

## Environment

- **Node.js**: v24.13.1
- **npm**: 11.10.0
- **Docker**: version 29.6.2, build dfc4efb
- **Supabase CLI**: 2.111.0

## Project Structure

- Scaffolding generated via Vite (React, TypeScript).
- Architecture established: `src/app`, `src/components/ui`, `src/components/shared`, `src/features`, `src/hooks`, `src/lib`, `src/types`.
- Created minimal application shell (`src/main.tsx`, `src/app/App.tsx`) with React Router and React Query providers.

## Dependencies

- `@supabase/supabase-js`: Database/Auth client.
- `@tanstack/react-query`: Server state management.
- `react-hook-form`, `zod`, `@hookform/resolvers`: Forms and validation.
- `react-router-dom`: Client-side routing.
- `lucide-react`: Icons.
- `tailwindcss`, `@tailwindcss/vite`, `postcss`, `autoprefixer`, `clsx`, `tailwind-merge`: UI and styling framework (Tailwind v4 with shadcn/ui structural initialization).
- `vitest`, `@testing-library/react`, `jsdom`, `@testing-library/jest-dom`, `@playwright/test`: Testing stack.
  (Detailed reasoning available in `docs/02-development/dependencies.md`)

## Supabase

- Initialized local Supabase project (`supabase init`).
- Created `.env.example` and `.env.local` containing the development `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Testing

- Configured Vitest (`vitest.config.ts`, `tests/setup.ts`).
- Configured Playwright (`playwright.config.ts`).
- Created basic unit smoke test (`src/app/App.test.tsx`).
- Created basic E2E smoke test (`e2e/smoke.spec.ts`).
- Run results: Passed.

## Performance Baseline

- Measured after `npm run build` on production bundle:

- **HTML (`index.html`)**: 0.45 kB (gzip: 0.28 kB)
- **CSS (`index.css`)**: 2.14 kB (gzip: 0.62 kB)
- **JavaScript (`index.js`)**: 253.12 kB (gzip: 80.11 kB)
  (Documented in `docs/05-performance/baseline.md`)

## Git

- Initialized empty Git repository.
- Created `.gitignore` excluding secrets (`.env.local`), `node_modules`, `dist`, `.supabase`, and test coverage.
- Created initial commit. (Hash: `427070c`)

## Security

- `VITE_SUPABASE_ANON_KEY` is safely tracked as an example in `.env.example`.
- `.env.local` is ignored by Git, ensuring local overrides and sensitive info (like service role keys) are never committed.

## Decisions

- Used `@tailwindcss/vite` instead of `postcss` plugin because Tailwind CSS v4 is used by default in Vite templates now.
- Minimal routing initialized at the `main.tsx` level using `<BrowserRouter>`.

## Issues

- `shadcn-ui` init command occasionally fails due to path alias parsing issues with Vite config on Tailwind v4, but we successfully mapped aliases in `tsconfig.json` and generated `components.json`. UI foundation is intact.

## Next Phase

The project is ready for database and architecture implementation.

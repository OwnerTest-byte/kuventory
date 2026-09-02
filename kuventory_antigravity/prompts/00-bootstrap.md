# KUVENTORY — PHASE 0 BOOTSTRAP

Prepare the KUVENTORY development environment, but do not build features.

## Stack
React + TypeScript + Vite; Tailwind CSS + shadcn/ui; TanStack Query; React Hook Form + Zod; Supabase/PostgreSQL; Supabase Auth; PostgreSQL RLS; Supabase Functions/RPC; Supabase Realtime only where justified; Vitest; React Testing Library; Playwright; Supabase CLI; Docker; Git/GitHub.

## Tasks
- Verify Node, npm, Git, Docker, Supabase CLI, browsers, and Antigravity tooling.
- Record versions.
- Inspect repository and project state.
- Inspect dependencies.
- Inspect PICS/ assets.
- Inspect Supabase configuration without changing it.
- Establish `.env.example` requirements; never create committed secrets.
- Establish lint/typecheck/test/build scripts if missing.
- Create or validate AGENTS.md and `.antigravity/` rules/workflows.

## Restrictions
No feature implementation. No database reset. No production changes. No deletions.

## Deliverables
- `docs/environment.md`
- `docs/phase-reports/PHASE-0.md`

Stop when the workspace is ready for the audit.

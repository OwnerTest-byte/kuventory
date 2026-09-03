# KUVENTORY — PHASE 1: AUDIT

Perform an inspection-only audit. Do not modify/delete/reset anything. Inventory files, routes, components, hooks, utilities, dependencies, Supabase schema/migrations/RLS, auth, reports, exports, tests, assets, and configuration. Classify every feature KEEP/REWORK/REPLACE/REMOVE/UNKNOWN against approved KUVENTORY scope. Trace candidate dead code and dependency usage before proposing removal. Inspect performance risks: duplicate requests, unbounded queries, rerenders, large assets, effects, polling, memory/DOM. Produce `docs/phase-reports/PHASE-1-AUDIT.md` with evidence, risks, recommendations, and migration strategy. Stop.

## Required completion artifact

Update the applicable documentation, CHANGELOG, automated tests, and `docs/phase-reports/PHASE-1.md`. Record actual commands and results. Never claim PASS without execution evidence.

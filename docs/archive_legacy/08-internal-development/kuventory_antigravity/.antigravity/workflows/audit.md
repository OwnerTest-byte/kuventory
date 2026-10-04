# /audit

## Objective

Perform an inspection-only audit of KUVENTORY.

## Procedure

1. Identify repository root and active branch.
2. Verify environment and package manager.
3. Inventory all files, routes, features, components, hooks, utilities, tests, assets, and database artifacts.
4. Inspect Supabase configuration and determine the active development project without changing anything.
5. Classify features KEEP, REWORK, REPLACE, REMOVE, or UNKNOWN against the approved KUVENTORY scope.
6. Find candidate dead code, unused dependencies, duplicated logic, duplicate queries, oversized assets, and performance risks.
7. Do not delete, reset, migrate, or refactor.
8. Produce `docs/phase-reports/PHASE-AUDIT.md` using the phase report template.

## Exit criteria

The audit report must contain evidence, not guesses, and explicitly list unknowns requiring later inspection.

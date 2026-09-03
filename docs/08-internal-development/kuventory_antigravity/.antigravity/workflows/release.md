# /release

## Objective

Prepare a reproducible KUVENTORY release.

## Procedure

1. Determine the semantic version change from the actual diff.
2. Run typecheck, lint, unit/component tests, DB/RLS tests, build, and critical E2E tests.
3. Run security and performance checks.
4. Verify migrations, docs, changelog, and environment files.
5. Verify no secrets/debug code/development-only artifacts are committed.
6. Generate release notes, patch notes, version report, migration summary, test report, and performance/security summaries.
7. Show the exact commit and tag that will be created.
8. Do not push or perform destructive Git operations without explicit approval.

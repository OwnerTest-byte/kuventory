# /test

## Objective
Validate the current KUVENTORY state.

## Procedure
Run the smallest relevant tests first, then progressively broader tests:
1. Typecheck
2. Lint
3. Unit/component tests
4. Database/RLS tests
5. Production build
6. Critical Playwright E2E tests

Record commands, results, failures, screenshots/traces where relevant, and environment information.

Never report PASS unless the command actually ran and passed.

# /clean

## Objective

Remove confirmed dead code and unnecessary complexity without changing behavior.

## Procedure

1. Run typecheck/lint/build.
2. Identify unused files/imports/functions/components/hooks/types/dependencies.
3. Trace usage before deletion.
4. Remove confirmed dead code only.
5. Check for duplicate utilities/components/queries/business rules.
6. Consolidate only when it improves maintainability without unnecessary abstraction.
7. Re-run tests and compare bundle size.
8. Document removed items.

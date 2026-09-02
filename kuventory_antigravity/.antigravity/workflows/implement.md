# /implement

## Objective
Implement one approved plan without scope expansion.

## Procedure
1. Confirm the approved plan exists.
2. Inspect affected code one more time.
3. Implement the smallest coherent change.
4. Avoid new dependencies unless justified.
5. Keep business logic close to the correct layer; database integrity belongs in the database.
6. Run targeted tests immediately.
7. Run typecheck and lint.
8. Review the diff for dead code, duplication, accidental scope changes, secrets, and debug output.
9. Update documentation.
10. Produce a phase report.

## Exit criteria
Targeted tests, typecheck, lint, and build are clean, or failures are documented with causes.

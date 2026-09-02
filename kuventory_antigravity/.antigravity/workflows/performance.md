# /performance

## Objective
Measure and improve verified KUVENTORY bottlenecks.

## Procedure
1. Build production mode.
2. Measure bundle/chunk sizes.
3. Inspect network requests and duplicates.
4. Inspect render behavior and expensive operations.
5. Inspect images/assets.
6. Test low-end CPU/network conditions with Playwright/browser tooling.
7. Apply only evidence-based improvements.
8. Re-measure.
9. Record before/after metrics in `docs/performance/optimization-log.md`.
10. Re-run tests.

Do not add libraries merely to claim optimization.

# KUVENTORY ENGINEERING RULES

## 1. Product scope

KUVENTORY is a focused inventory system.

Approved modules:

- Authentication
- Inventory
- Categories
- Daily Inventory
- Stock Batches
- FEFO
- Stock History
- Notifications
- Reports
- Archive
- PDF/XLSX/CSV export

Do not introduce Sales, POS, Purchases, Customers, Expenses, Accounting, Revenue, Profit, Orders, or unrelated ERP modules.

## 2. Engineering objective

Build the smallest complete system that satisfies the approved requirements.
Prioritize correctness, simplicity, performance, security, maintainability, and compatibility with older/low-end devices.

## 3. Code quality

- Use strict TypeScript.
- No dead code.
- No unused imports, variables, functions, components, hooks, types, routes, or dependencies.
- No speculative abstractions.
- No duplicate business logic.
- No copy-pasted components where a clear shared component is justified.
- Do not split simple logic into unnecessary files.
- Prefer readable code over clever code.
- Do not add a dependency when existing/native functionality reasonably solves the problem.

## 4. Performance

- Minimize browser JavaScript, network requests, database round trips, DOM size, image weight, and memory usage.
- Avoid unnecessary rerenders and effects.
- Do not poll unless there is a documented reason.
- Use pagination for unbounded datasets.
- Lazy-load nonessential routes/features where it measurably helps.
- Do not use heavy animations, large decorative assets, or GPU-intensive effects.
- Measure before optimizing.
- Do not add an optimization library without a demonstrated need.

## 5. Browser/device compatibility

Support practical current browsers while remaining usable on low-end Android devices and older office PCs. Avoid unnecessary bleeding-edge browser APIs. Verify responsive behavior at approximately 1366x768, 768x1024, 390x844, and 393x852.

## 6. Database

- Every schema change must be represented by a migration.
- Use PostgreSQL constraints for data integrity where appropriate.
- Index only justified access paths.
- Critical inventory mutations must be atomic.
- Do not use unsafe frontend read-modify-write for stock mutations.
- Finalized report snapshots must remain historically accurate.

## 7. Security

- Authorization must be enforced with PostgreSQL RLS and server/database logic, not only UI checks.
- Never expose service-role credentials to browser code.
- Never commit secrets.
- Development MCP access must be scoped to the KUVENTORY development project.
- Destructive database actions require environment verification.

## 8. Roles

Only ADMIN and USER exist unless the approved requirements are explicitly changed.
ADMIN manages users, categories, inventory master data, archive/restore, historical corrections, reports, and audit records.
USER performs normal inventory operations and permitted report access.

## 9. Inventory

Daily calculations:
TOTAL = BEG + ADD
ENDING = BEG + ADD - AM - PM

FEFO must be enforced in the inventory mutation process, not just visually sorted in the frontend.

## 10. Reports

The user performs inventory; KUVENTORY generates the daily report.
Finalized reports are immutable historical snapshots. Exports must use the stored snapshot, not mutable live inventory.

## 11. Testing

Critical behavior must have automated tests. Security-sensitive behavior requires authorization tests. Critical end-to-end workflows require Playwright coverage. Database integrity and RLS require database-level tests where practical.

## 12. Documentation

Keep implementation and documentation synchronized. Update relevant feature docs, architecture docs, ADRs, CHANGELOG.md, release notes, and phase reports.

## 13. Versioning

Use semantic versioning. Every meaningful release produces release notes, patch notes, a version report, and a Git tag.

## 14. Agent behavior

Inspect before modifying. Plan before large changes. Make small verifiable changes. Run tests after meaningful changes. Never claim a test passed unless it was actually executed. Never claim functionality exists unless verified. Prefer evidence from the repository, tests, and browser over assumptions.

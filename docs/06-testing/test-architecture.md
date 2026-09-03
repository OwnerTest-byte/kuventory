# Testing Architecture

KUVENTORY employs a multi-layered testing strategy to guarantee reliability and mathematical correctness without excessive, brittle test overhead.

## 1. Unit Tests (Vitest)

- **Scope**: Utility functions, math calculations (FEFO allocation logic), Zod validation schemas, and isolated complex React components.
- **Tooling**: `vitest`, `@testing-library/react`.
- **Rules**: Do not write unit tests for simple wrappers around Supabase queries. Mocking the database for simple CRUD is low-value.

## 2. Integration / Database Tests

- **Scope**: PostgreSQL functions (RPCs), Row Level Security (RLS) policies, Constraints.
- **Tooling**: Supabase local testing environment (e.g., `pgTAP` or local integration tests via the Supabase JS client running against the local Docker instance).
- **Rules**: The FEFO RPC mutation must be exhaustively tested here. Assert that User A cannot read User B's secure data (if applicable), and that a USER cannot modify Master Data.

## 3. End-to-End Tests (Playwright)

- **Scope**: Critical user workflows (Happy Paths).
  1. Login as Admin.
  2. Create a Category and Item.
  3. Create a Daily Inventory Draft.
  4. Enter AM/PM quantities.
  5. Finalize the Inventory.
  6. Verify the immutable Report Snapshot.
- **Tooling**: `@playwright/test`.
- **Rules**: E2E tests run against a dedicated local test database. They act as the final smoke test before a release.

## Traceability

Every requirement defined in the approved scope must trace to a test:

- **Math/FEFO Requirement** -> Tested in Database RPC Tests + Unit Tests.
- **Report Immutability Requirement** -> Tested in E2E Workflow.
- **Role Permissions Requirement** -> Tested in RLS Database Tests.

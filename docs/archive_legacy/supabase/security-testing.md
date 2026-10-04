# Security Testing Strategy

This document explains how RLS security is verified in Kuventory.

## Testing Automation

A programmatic PL/pgSQL script is located at `supabase/tests/rls_test.sql`. It relies on switching the `request.jwt.claims` config to simulate different logged-in users directly at the database level.

### Test Scenarios Covered

1. **Anonymous Bypass**:
   - Sets role to `anon`.
   - Attempts to read `stock_items`.
   - Expectation: Fails / Returns 0 rows.

2. **Privilege Escalation**:
   - Simulates authentication as a Cashier.
   - Attempts to `INSERT` into the `roles` table.
   - Expectation: Fails (Throws RLS constraint violation).

3. **Role Boundary Tests**:
   - Simulates authentication as Inventory Staff.
   - Attempts to `INSERT` into `sales`.
   - Expectation: Fails.

4. **Cross-User Data**:
   - Simulates authentication as Cashier.
   - Attempts to `INSERT` or `UPDATE` a notification belonging to another user.
   - Expectation: Fails.

## How to Run Tests

If you have Docker Desktop and Supabase CLI running locally, you can run the test script by piping it into the local database:

```bash
npx supabase db reset
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/rls_test.sql
```
*(Note: Replace connection strings as appropriate for your local docker setup)*

If the test script executes successfully without raising exceptions, all RLS boundaries have held strong.

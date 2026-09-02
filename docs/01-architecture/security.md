# Security Architecture

Security in KUVENTORY relies on a zero-trust model where the browser is considered compromised, and all enforcement happens at the PostgreSQL layer via Row Level Security (RLS) and authorized RPC functions.

## Authentication
- **Provider**: Supabase GoTrue Auth.
- **Mechanism**: JWT tokens provided by Supabase.
- **Client Strategy**: `VITE_SUPABASE_ANON_KEY` is safely exposed to the client. The frontend uses the Supabase JS client to manage sessions.

## Row Level Security (RLS)
Every table in KUVENTORY operates under RLS. By default, access is denied.

### Verification Pattern
We use a database function `auth.uid()` to identify the requesting user, and a function `get_user_role(auth.uid())` to securely determine their authorization level before fulfilling the query.

### Data Mutation Isolation
- Direct `UPDATE` or `DELETE` statements from the client on `stock_batches` and `stock_movements` are **strictly forbidden** by RLS.
- Stock mutations are only accessible by calling restricted PostgreSQL RPC functions. These functions bypass RLS internally (`SECURITY DEFINER`) after verifying the user's role explicitly, ensuring the atomic FEFO transactions and audit logs cannot be circumvented by a malicious client.

## Audit Logs
Important actions (e.g., Finalizing a daily inventory, modifying master data, archiving a report) create an immutable entry in the `audit_logs` table.
- Contains the `actor_id`, `action`, `target_table`, `target_id`, and a JSON diff of `old_data`/`new_data`.
- This table has an `INSERT`-only RLS policy for the application. Updates and Deletes are forbidden.

## Local Development vs Production
Development environments (like local Docker setups) use separate keys and mock data. No production data is ever pulled to local environments to avoid accidental leakage. Production secrets (Service Role Key) are never committed and never shared with the frontend.

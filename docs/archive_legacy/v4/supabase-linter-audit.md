# Supabase Linter Audit (v4)

## PHASE 2 — FUNCTION SEARCH_PATH WARNINGS

| Function | Current Config | Risk | Proposed Solution | Behavior Changes |
| :--- | :--- | :--- | :--- | :--- |
| `handle_updated_at` | No explicit search_path | Privilege escalation if search_path hijacked | `SET search_path = ''` | No |
| `handle_new_user` | No explicit search_path | Privilege escalation | `SET search_path = ''` | No |
| `create_purchase` | `SET search_path = public` | Search path injection into public | `SET search_path = ''` & explicitly qualify schema | No |
| `inventory_adjust` | No explicit search_path | Privilege escalation | `SET search_path = ''` | No |
| `create_stock_transfer` | `SET search_path = public` | Injection | `SET search_path = ''` & qualify schema | No |
| `complete_stock_transfer` | `SET search_path = public` | Injection | `SET search_path = ''` & qualify schema | No |
| `receive_purchase` | `SET search_path = public` | Injection | `SET search_path = ''` & qualify schema | No |
| `open_cash_session` | `SET search_path = public` | Injection | `SET search_path = ''` & qualify schema | No |
| `close_cash_session` | `SET search_path = public` | Injection | `SET search_path = ''` & qualify schema | No |
| `process_sale` | `SET search_path = public` | Injection | `SET search_path = ''` & qualify schema | No |
| `create_expense` | `SET search_path = public` | Injection | `SET search_path = ''` & qualify schema | No |

## PHASE 3 — SECURITY DEFINER FUNCTIONS

| Function | Current Config | Risk | Proposed Solution | Behavior Changes |
| :--- | :--- | :--- | :--- | :--- |
| `create_stock_movement` | Executable by PUBLIC/authenticated | Unauthorized generic inventory modification | REVOKE EXECUTE from PUBLIC/anon/authenticated | RPC calls blocked from REST. Database-internal calls still work. |
| `handle_new_user` | Executable by PUBLIC | Unauthorized fake user profile creation | REVOKE EXECUTE from PUBLIC/anon/authenticated | Trigger only. |
| `has_any_role` | Executable by PUBLIC | Role enumeration | REVOKE EXECUTE from PUBLIC/anon/authenticated | Internal RLS only. |
| `has_role` | Executable by PUBLIC | Role enumeration | REVOKE EXECUTE from PUBLIC/anon/authenticated | Internal RLS only. |

## PHASE 8 — AUDIT LOGS

| Table | Current Policy | Risk | Proposed Solution |
| :--- | :--- | :--- | :--- |
| `audit_logs` | INSERT `WITH CHECK (true)` | Users could spoof audit entries and fake the `user_id`. | Ensure `WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))` |

## PHASE 9 — AUTH RLS INITPLAN WARNINGS

| Table | Current Policy | Risk | Proposed Solution |
| :--- | :--- | :--- | :--- |
| `profiles` | `auth.uid() = auth_user_id` | Performance (auth.uid evaluated per row) | `(select auth.uid()) = auth_user_id` |
| `cash_sessions` | Multiple | Performance | Wrap `auth.uid()` in `(select auth.uid())` |
| `cash_transactions` | Multiple | Performance | Same as above |
| `notifications` | Multiple | Performance | Same as above |

## PHASE 10-17 — MULTIPLE PERMISSIVE POLICIES

- Consolidating policies in `cash_sessions`, `cash_transactions`, `categories`, `daily_inventory_lines`, `discounts`, `expense_categories`.
- Action: Map out overlaps and combine them into single robust `USING` conditions.

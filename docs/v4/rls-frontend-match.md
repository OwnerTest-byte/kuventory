# Frontend ? RLS Match Matrix (v4.0.0)

| Table | SELECT | INSERT | UPDATE | DELETE | Frontend Expectation | Match Status |
|---|---|---|---|---|---|---|
| profiles | All (authenticated) | Admin/Manager | Self/Admin | Admin | Frontend restricts edit to Admin/Manager/Self | MATCHED |
| categories | All | Admin/Manager | Admin/Manager | Admin/Manager | Frontend restricts edit to Admin/Manager | MATCHED |
| stock_items | All | Admin/Manager | Admin/Manager | Admin/Manager | Frontend restricts edit to Admin/Manager | MATCHED |
| suppliers | All | Admin/Manager | Admin/Manager | Admin/Manager | Frontend restricts edit to Admin/Manager | MATCHED |
| purchases | All | RPC | RPC | Admin/Manager | UI uses RPC for transactions | MATCHED |
| sales | All | RPC | RPC | Admin/Manager | UI uses RPC for transactions | MATCHED |
| expenses | All | RPC | RPC | Admin/Manager | UI uses RPC for transactions | MATCHED |
| stock_movements | All | RPC | RPC | None | UI uses RPC for transactions | MATCHED |
| cash_sessions | All | RPC | RPC | None | UI uses RPC for transactions | MATCHED |
| discounts | All | RPC | None | None | UI uses RPC | MATCHED |

NOTE: The frontend properly delegates all write transactions (Insert/Update) to the Supabase Postgres RPCs which are running as SECURITY INVOKER, successfully subjecting them to RLS validation before persisting changes.

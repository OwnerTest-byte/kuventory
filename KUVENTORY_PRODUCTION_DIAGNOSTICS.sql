-- KUVENTORY Production Diagnostics (READ ONLY)
-- Run in the Supabase SQL Editor. This query does not alter data or schema.
-- It confirms whether expected RPC signatures exist in the connected project.

SELECT
  current_database() AS database_name,
  current_setting('TimeZone') AS database_timezone,
  to_regprocedure('public.create_inventory_item_with_initial_stock(text,uuid,text,numeric,date,text,text,numeric,numeric,text,text,text)')
    AS create_item_with_initial_stock_rpc,
  to_regprocedure('public.add_stock(uuid,numeric,date,date,text)')
    AS add_stock_rpc,
  to_regprocedure('public.claim_user_session(text,text,text,integer,boolean)')
    AS claim_user_session_rpc,
  to_regprocedure('public.heartbeat_user_session(text,integer)')
    AS heartbeat_user_session_rpc;

-- Interpretation:
-- A NULL result in any *_rpc column means that exact function signature is missing.
-- Do not manually create partial replacement functions. Apply/reconcile the project's
-- versioned Supabase migrations after a backup and confirm the function signatures again.

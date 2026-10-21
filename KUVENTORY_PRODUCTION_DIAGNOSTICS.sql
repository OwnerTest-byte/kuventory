-- KUVENTORY Production Diagnostics (READ ONLY)
-- Run in the Supabase SQL Editor. This query does not alter data or schema.
-- It confirms whether expected RPC signatures exist in the connected project.

-- 1. RPC Signatures Check
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

-- 2. stock_batches.initial_quantity Column & Trigger Verification
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'stock_batches'
  AND column_name = 'initial_quantity';

-- 3. Data Invariant Verification (Must be 0)
SELECT COUNT(*) AS invalid_batches
FROM public.stock_batches
WHERE initial_quantity IS NULL OR initial_quantity < 0;

-- 4. Triggers Verification (initial_quantity trigger & inventory threshold trigger)
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table, 
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'trg_stock_batches_set_initial_quantity',
    'on_batch_change_check_thresholds',
    'on_item_change_check_thresholds'
  );

-- Interpretation:
-- - All *_rpc columns should be non-NULL.
-- - initial_quantity should have is_nullable = NO and column_default = 0.
-- - invalid_batches must return 0.
-- - If any check fails, apply 20261022000000_fix_stock_batches_initial_quantity.sql
--   and 20261021210000_atomic_create_item_and_initial_stock.sql in Supabase SQL Editor.

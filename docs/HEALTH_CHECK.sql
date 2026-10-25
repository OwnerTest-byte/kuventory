-- ============================================================================
-- KUVENTORY SYSTEM HEALTH CHECK
-- Paste this WHOLE FILE into the Supabase SQL editor and run it.
-- It verifies every recent change and prints your accounts + a promotion
-- template. Read the output top to bottom.
-- ============================================================================

-- 1. YOUR ACCOUNTS AND ROLES -------------------------------------------------
-- Every account must show STAFF, ADMIN, or SUPER_ADMIN.
-- If your primary account shows STAFF but should be an administrator,
-- copy the promotion statement at the bottom and run it.
SELECT display_name, role, updated_at
FROM public.profiles
ORDER BY role, display_name;

-- 2. ROLE CONSTRAINT (must list STAFF/ADMIN/SUPER_ADMIN only) ----------------
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_role_check';

-- 3. FUNCTION ALLOWLISTS (the strict-roles sweep) ----------------------------
-- finalize_daily_inventory must contain 'STAFF', 'ADMIN', 'SUPER_ADMIN'
-- consume_stock (3-arg) must contain 'STAFF'
-- admin_update_user_role must contain 'STAFF'
SELECT p.proname AS function_name,
       CASE
         WHEN pg_get_functiondef(p.oid) LIKE '%STAFF%' THEN 'STAFF-aware ✓'
         ELSE 'MISSING STAFF — migration not applied ✗'
       END AS status
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('finalize_daily_inventory', 'admin_update_user_role');

SELECT
  CASE
    WHEN (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace
            AND p.proname = 'consume_stock'
            AND pg_get_function_arguments(p.oid) LIKE '%p_reason TEXT DEFAULT%'
          ) LIKE '%STAFF%'
    THEN 'consume_stock (3-arg) STAFF-aware ✓ — staff Finalize Day will work'
    ELSE 'consume_stock (3-arg) MISSING STAFF — apply 20261026190000 ✗'
  END AS consume_stock_status;

-- 4. STAFF REQUEST PIPELINE (tables + RPCs exist) ----------------------------
SELECT
  CASE WHEN to_regclass('public.staff_change_requests') IS NOT NULL
       THEN 'staff_change_requests table ✓' ELSE 'MISSING — apply 20261026160000 ✗' END AS request_table,
  CASE WHEN to_regprocedure('public.submit_staff_change_request(text,jsonb,text)') IS NOT NULL
       THEN 'submit RPC ✓' ELSE 'MISSING ✗' END AS submit_rpc,
  CASE WHEN to_regprocedure('public.review_staff_change_request(uuid,text,text)') IS NOT NULL
       THEN 'review RPC ✓' ELSE 'MISSING ✗' END AS review_rpc;

-- 5. PENDING REQUESTS WAITING FOR ADMIN REVIEW -------------------------------
SELECT request_type, status, reason, created_at
FROM public.staff_change_requests
ORDER BY created_at DESC
LIMIT 10;

-- 6. GRANTS SANITY (authenticated must be able to reach the core objects) ----
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name IN ('inventory_stock_view', 'reports', 'report_items', 'notifications')
ORDER BY table_name, privilege_type;

-- ============================================================================
-- PROMOTION TEMPLATE (only if step 1 showed your account as STAFF):
--   UPDATE public.profiles SET role = 'ADMIN' WHERE display_name = '<your name>';
-- MIGRATIONS THIS CHECK REFERENCES:
--   20261026150000 strict roles · 20261026160000 request pipeline ·
--   20261026170000 notification scoping · 20261026180000 staff finalize ·
--   20261026190000 consume_stock staff path
-- ============================================================================

-- ============================================================================
-- MIGRATION: 20261026160000_staff_change_requests_and_role_boundary.sql
-- PURPOSE (owner decision, 2026-10-25):
--   PART B2 — REQUEST PIPELINE: every structural change a STAFF member needs
--   (add/edit/archive item, adjust stock, reassign table, new station, remove
--   from worksheet) becomes a REQUEST. Staff submit through
--   submit_staff_change_request; administrators review the queue with the
--   full requested-vs-current context and decide: APPROVE & APPLY (the change
--   is executed SERVER-SIDE in the same transaction — auto-put into the
--   system), RETURN (sent back for changes), or REJECT (reason required).
--   Any apply failure marks the request FAILED with the honest reason — a
--   failed apply can never be reported as success.
--   PART B — ROLE BOUNDARY (the authority layer): direct client writes to
--   catalog/stock/worksheet structure are blocked by RLS; the definer RPCs
--   (receive_daily_inventory_stock, create_daily_inventory_draft, the request
--   pipeline) remain the only staff write paths. A trigger restricts staff
--   worksheet edits to the operational columns (add / sales_am / sales_pm).
-- Forward-only. finalize/corrections/lockout/recovery flows are untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STAFF CHANGE REQUESTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (request_type IN (
    'ADD_ITEM', 'EDIT_ITEM', 'ARCHIVE_ITEM', 'ADJUST_STOCK',
    'REASSIGN_TABLE', 'ADD_CATEGORY', 'REMOVE_FROM_SHEET'
  )),
  payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'FAILED')),
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  reviewed_by UUID REFERENCES public.profiles(id),
  review_notes TEXT,
  decision_reason TEXT,
  applied_at TIMESTAMPTZ,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_change_requests_status
  ON public.staff_change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_change_requests_requester
  ON public.staff_change_requests (requested_by, created_at DESC);

ALTER TABLE public.staff_change_requests ENABLE ROW LEVEL SECURITY;

-- Requesters see their own requests; administrators see the whole queue.
DROP POLICY IF EXISTS "Staff see own change requests" ON public.staff_change_requests;
CREATE POLICY "Staff see own change requests"
  ON public.staff_change_requests FOR SELECT
  TO authenticated
  USING (
    requested_by = (SELECT auth.uid())
    OR public.is_admin()
  );

-- Submissions only through the RPC path: a client INSERT must carry its own
-- identity and a PENDING status; review state changes are RPC-only.
DROP POLICY IF EXISTS "Staff submit own change requests" ON public.staff_change_requests;
CREATE POLICY "Staff submit own change requests"
  ON public.staff_change_requests FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = (SELECT auth.uid()) AND status = 'PENDING');

-- No client UPDATE/DELETE policy: decisions flow exclusively through the
-- SECURITY DEFINER review RPC (fail-closed by absence).

-- Realtime for the admin queue and the requester's My Requests panel.
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_change_requests;

-- Targeted decision notifications rely on this column existing.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 2. SUBMIT — staff-facing entry point
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_staff_change_request(
  p_request_type TEXT,
  p_payload JSONB,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_type TEXT := UPPER(TRIM(COALESCE(p_request_type, '')));
  v_payload JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_clean_reason TEXT := TRIM(COALESCE(p_reason, ''));
  v_req_id UUID;
  v_admin RECORD;
  v_tmp TEXT;
  v_item_exists BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to submit a change request.';
  END IF;

  IF v_clean_type NOT IN ('ADD_ITEM', 'EDIT_ITEM', 'ARCHIVE_ITEM', 'ADJUST_STOCK', 'REASSIGN_TABLE', 'ADD_CATEGORY', 'REMOVE_FROM_SHEET') THEN
    RAISE EXCEPTION 'Invalid request type.';
  END IF;

  IF v_clean_reason = '' THEN
    RAISE EXCEPTION 'A reason describing the requested change is required.';
  END IF;

  ---------------------------------------------------------------- VALIDATION
  IF v_clean_type = 'ADD_ITEM' THEN
    IF COALESCE(NULLIF(TRIM(v_payload->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'Item name is required.';
    END IF;
    IF COALESCE(NULLIF(TRIM(v_payload->>'unit'), ''), '') = '' THEN
      RAISE EXCEPTION 'Unit of measure is required.';
    END IF;
    IF COALESCE((v_payload->>'initial_quantity')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Initial quantity cannot be negative.';
    END IF;
    IF COALESCE((v_payload->>'initial_quantity')::numeric, 0) > 0 THEN
      IF v_payload->>'expiry_date' IS NULL THEN
        RAISE EXCEPTION 'An expiry date is required when requesting initial stock.';
      END IF;
      IF (v_payload->>'expiry_date')::date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Expiry date cannot be in the past.';
      END IF;
    END IF;
    IF v_payload->>'category_id' IS NOT NULL THEN
      SELECT 'ok' INTO v_tmp FROM public.categories WHERE id = (v_payload->>'category_id')::uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Requested station (category) does not exist.';
      END IF;
    END IF;

  ELSIF v_clean_type IN ('EDIT_ITEM', 'ARCHIVE_ITEM', 'ADJUST_STOCK', 'REASSIGN_TABLE') THEN
    IF v_payload->>'item_id' IS NULL THEN
      RAISE EXCEPTION 'The item to change must be specified.';
    END IF;
    SELECT 'ok' INTO v_tmp FROM public.inventory_items WHERE id = (v_payload->>'item_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Requested item does not exist.';
    END IF;

    IF v_clean_type = 'EDIT_ITEM' THEN
      IF COALESCE(v_payload->'changes', '{}'::jsonb) = '{}'::jsonb THEN
        RAISE EXCEPTION 'Specify at least one field to change.';
      END IF;
      IF v_payload->'changes' ? 'name' AND COALESCE(NULLIF(TRIM(v_payload->'changes'->>'name'), ''), '') = '' THEN
        RAISE EXCEPTION 'Item name cannot be empty.';
      END IF;
      IF v_payload->'changes' ? 'unit' AND COALESCE(NULLIF(TRIM(v_payload->'changes'->>'unit'), ''), '') = '' THEN
        RAISE EXCEPTION 'Unit of measure cannot be empty.';
      END IF;
      IF v_payload->'changes' ? 'min_quantity' AND COALESCE((v_payload->'changes'->>'min_quantity')::numeric, 0) < 0 THEN
        RAISE EXCEPTION 'Minimum quantity cannot be negative.';
      END IF;
    END IF;

    IF v_clean_type = 'ADJUST_STOCK' THEN
      IF v_payload->>'target_quantity' IS NULL THEN
        RAISE EXCEPTION 'The requested stock target is required.';
      END IF;
      IF (v_payload->>'target_quantity')::numeric < 0 THEN
        RAISE EXCEPTION 'Requested stock target cannot be negative.';
      END IF;
    END IF;

    IF v_clean_type = 'REASSIGN_TABLE' THEN
      IF v_payload->>'target_category_id' IS NULL THEN
        RAISE EXCEPTION 'The destination station is required.';
      END IF;
      SELECT 'ok' INTO v_tmp FROM public.categories WHERE id = (v_payload->>'target_category_id')::uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Destination station does not exist.';
      END IF;
    END IF;

  ELSIF v_clean_type = 'ADD_CATEGORY' THEN
    IF COALESCE(NULLIF(TRIM(v_payload->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'Station name is required.';
    END IF;
    SELECT 'ok' INTO v_tmp FROM public.categories WHERE LOWER(name) = LOWER(TRIM(v_payload->>'name'));
    IF FOUND THEN
      RAISE EXCEPTION 'A station with that name already exists.';
    END IF;

  ELSIF v_clean_type = 'REMOVE_FROM_SHEET' THEN
    IF v_payload->>'daily_inventory_item_id' IS NULL THEN
      RAISE EXCEPTION 'The worksheet entry to remove must be specified.';
    END IF;
    SELECT 'ok' INTO v_tmp
    FROM public.daily_inventory_items dii
    JOIN public.daily_inventory di ON dii.daily_inventory_id = di.id
    WHERE dii.id = (v_payload->>'daily_inventory_item_id')::uuid AND di.state = 'DRAFT';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That worksheet entry no longer exists or the sheet is finalized.';
    END IF;
  END IF;

  -- Duplicate guard: one PENDING request per target at a time.
  IF v_clean_type IN ('EDIT_ITEM', 'ARCHIVE_ITEM', 'ADJUST_STOCK', 'REASSIGN_TABLE') THEN
    SELECT 'ok' INTO v_tmp FROM public.staff_change_requests
    WHERE status = 'PENDING' AND request_type = v_clean_type AND payload->>'item_id' = v_payload->>'item_id';
    IF FOUND THEN
      RETURN jsonb_build_object(
        'submitted', false,
        'request_id', NULL,
        'message', 'You already have a pending request for this item. An administrator will review it first.'
      );
    END IF;
  ELSIF v_clean_type = 'REMOVE_FROM_SHEET' THEN
    SELECT 'ok' INTO v_tmp FROM public.staff_change_requests
    WHERE status = 'PENDING' AND request_type = 'REMOVE_FROM_SHEET'
      AND payload->>'daily_inventory_item_id' = v_payload->>'daily_inventory_item_id';
    IF FOUND THEN
      RETURN jsonb_build_object(
        'submitted', false,
        'request_id', NULL,
        'message', 'You already have a pending removal request for this worksheet entry.'
      );
    END IF;
  ELSIF v_clean_type = 'ADD_CATEGORY' THEN
    SELECT 'ok' INTO v_tmp FROM public.staff_change_requests
    WHERE status = 'PENDING' AND request_type = 'ADD_CATEGORY'
      AND LOWER(payload->>'name') = LOWER(v_payload->>'name');
    IF FOUND THEN
      RETURN jsonb_build_object(
        'submitted', false,
        'request_id', NULL,
        'message', 'A request for that station name is already pending review.'
      );
    END IF;
  END IF;

  INSERT INTO public.staff_change_requests (
    request_type, payload, reason, status, requested_by
  ) VALUES (
    v_clean_type, v_payload, v_clean_reason, 'PENDING', v_caller_id
  ) RETURNING id INTO v_req_id;

  -- Notify every administrator (targeted rows: visible via the own-data rule).
  FOR v_admin IN
    SELECT id FROM public.profiles WHERE role IN ('ADMIN', 'SUPER_ADMIN')
  LOOP
    INSERT INTO public.notifications (
      type, title, message, target_id, user_id, dedup_key, created_at
    ) VALUES (
      'STAFF_CHANGE_REQUEST',
      format('Staff Change Request: %s', v_clean_type),
      format('%s submitted a %s request for review. Open Settings -> Requests.', public.mask_email(COALESCE((SELECT email FROM auth.users WHERE id = v_caller_id), 'staff')), v_clean_type),
      '/settings?tab=requests',
      v_admin.id,
      format('staff_change_req_%s_%s', v_req_id, v_admin.id),
      now()
    );
  END LOOP;

  INSERT INTO public.security_events (
    event_type, email_masked, actor_id, details
  ) VALUES (
    'STAFF_CHANGE_REQUEST_SUBMITTED',
    public.mask_email(COALESCE((SELECT email FROM auth.users WHERE id = v_caller_id), 'staff')),
    v_caller_id,
    jsonb_build_object('request_type', v_clean_type, 'request_id', v_req_id)
  );

  RETURN jsonb_build_object(
    'submitted', true,
    'request_id', v_req_id,
    'message', 'Your request was submitted. An administrator will review it and you will see the decision in My Requests.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_staff_change_request(TEXT, JSONB, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. REVIEW — admin decisions; APPROVE applies in-transaction
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_staff_change_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_clean_decision TEXT := UPPER(TRIM(COALESCE(p_decision, '')));
  v_clean_notes TEXT := TRIM(COALESCE(p_notes, ''));
  v_rec public.staff_change_requests%ROWTYPE;
  v_result_summary JSONB;
  v_new_item_id UUID;
  v_new_category_id UUID;
  v_today_sheet UUID;
  v_message TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: administrator authentication required.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can review change requests.';
  END IF;

  IF v_clean_decision NOT IN ('APPROVE', 'RETURN', 'REJECT') THEN
    RAISE EXCEPTION 'Invalid decision. Allowed: APPROVE, RETURN, REJECT.';
  END IF;

  SELECT * INTO v_rec
  FROM public.staff_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change request % not found.', p_request_id;
  END IF;

  IF v_rec.status != 'PENDING' THEN
    RAISE EXCEPTION 'Request % is already resolved (%).', v_rec.id, v_rec.status;
  END IF;

  -- Separation of duties: never decide your own request.
  IF v_rec.requested_by = v_caller_id THEN
    RAISE EXCEPTION 'Permission Denied: you cannot review your own change request.';
  END IF;

  IF v_clean_decision IN ('RETURN', 'REJECT') THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'Notes are required when returning or rejecting a request.';
    END IF;

    UPDATE public.staff_change_requests
    SET status = CASE WHEN v_clean_decision = 'RETURN' THEN 'RETURNED' ELSE 'REJECTED' END,
        reviewed_by = v_caller_id,
        review_notes = v_clean_notes,
        decision_reason = v_clean_notes,
        updated_at = now()
    WHERE id = v_rec.id;

    INSERT INTO public.notifications (
      type, title, message, target_id, user_id, dedup_key, created_at
    ) VALUES (
      'STAFF_CHANGE_REQUEST_DECISION',
      format('Your %s request was %s', v_rec.request_type, CASE WHEN v_clean_decision = 'RETURN' THEN 'returned' ELSE 'rejected' END),
      v_clean_notes,
      '/daily-inventory',
      v_rec.requested_by,
      format('staff_change_decision_%s', v_rec.id),
      now()
    );

    INSERT INTO public.security_events (
      event_type, email_masked, actor_id, details
    ) VALUES (
      'STAFF_CHANGE_REQUEST_DECIDED',
      public.mask_email(COALESCE((SELECT email FROM auth.users WHERE id = v_rec.requested_by), 'staff')),
      v_caller_id,
      jsonb_build_object('request_id', v_rec.id, 'decision', v_clean_decision)
    );

    RETURN jsonb_build_object(
      'success', true,
      'applied', false,
      'status', CASE WHEN v_clean_decision = 'RETURN' THEN 'RETURNED' ELSE 'REJECTED' END,
      'message', format('Request %s.', CASE WHEN v_clean_decision = 'RETURN' THEN 'returned to the requester for changes' ELSE 'rejected' END)
    );
  END IF;

  ------------------------------------------------------ APPROVE & APPLY ----
  -- The change executes inside this transaction. Any failure rolls the apply
  -- back and marks the request FAILED with the honest reason — never a fake
  -- success.
  BEGIN
    CASE v_rec.request_type
      WHEN 'ADD_ITEM' THEN
        v_new_item_id := public.create_inventory_item_with_initial_stock(
          TRIM(v_rec.payload->>'name'),
          (v_rec.payload->>'category_id')::uuid,
          TRIM(v_rec.payload->>'unit'),
          COALESCE((v_rec.payload->>'initial_quantity')::numeric, 0),
          (v_rec.payload->>'expiry_date')::date,
          NULL,
          NULL,
          0,
          COALESCE((v_rec.payload->>'min_quantity')::numeric, 0)
        );

        -- Sync the new item into today's worksheet when one is open.
        SELECT id INTO v_today_sheet
        FROM public.daily_inventory
        WHERE inventory_date = CURRENT_DATE AND state = 'DRAFT'
        LIMIT 1;
        IF v_today_sheet IS NOT NULL THEN
          INSERT INTO public.daily_inventory_items (daily_inventory_id, item_id, beg)
          VALUES (v_today_sheet, v_new_item_id, GREATEST(COALESCE((v_rec.payload->>'initial_quantity')::numeric, 0), 0))
          ON CONFLICT (daily_inventory_id, item_id) DO NOTHING;
        END IF;

        v_result_summary := jsonb_build_object('item_id', v_new_item_id, 'action', 'item created and added to today''s worksheet');

      WHEN 'EDIT_ITEM' THEN
        UPDATE public.inventory_items
        SET name = COALESCE(NULLIF(TRIM(v_rec.payload->'changes'->>'name'), ''), name),
            unit = COALESCE(NULLIF(TRIM(v_rec.payload->'changes'->>'unit'), ''), unit),
            min_quantity = COALESCE((v_rec.payload->'changes'->>'min_quantity')::numeric, min_quantity),
            updated_at = now()
        WHERE id = (v_rec.payload->>'item_id')::uuid;
        v_result_summary := jsonb_build_object('item_id', v_rec.payload->>'item_id', 'action', 'item details updated', 'changes', v_rec.payload->'changes');

      WHEN 'ARCHIVE_ITEM' THEN
        UPDATE public.inventory_items
        SET is_archived = true, is_active = false, updated_at = now()
        WHERE id = (v_rec.payload->>'item_id')::uuid;
        v_result_summary := jsonb_build_object('item_id', v_rec.payload->>'item_id', 'action', 'item archived');

      WHEN 'ADJUST_STOCK' THEN
        v_result_summary := jsonb_build_object(
          'item_id', v_rec.payload->>'item_id',
          'action', 'stock adjusted to requested target',
          'new_total', public.adjust_stock_to_target(
            (v_rec.payload->>'item_id')::uuid,
            (v_rec.payload->>'target_quantity')::numeric,
            COALESCE(TRIM(v_rec.payload->>'reason'), 'Approved staff adjustment'),
            NULL,
            (v_rec.payload->>'expiry_date')::date
          )
        );

      WHEN 'REASSIGN_TABLE' THEN
        UPDATE public.inventory_items
        SET category_id = (v_rec.payload->>'target_category_id')::uuid, updated_at = now()
        WHERE id = (v_rec.payload->>'item_id')::uuid;
        v_result_summary := jsonb_build_object('item_id', v_rec.payload->>'item_id', 'action', 'item reassigned to requested station');

      WHEN 'ADD_CATEGORY' THEN
        INSERT INTO public.categories (name, description)
        VALUES (TRIM(v_rec.payload->>'name'), NULLIF(TRIM(v_clean_notes), ''))
        RETURNING id INTO v_new_category_id;
        v_result_summary := jsonb_build_object('category_id', v_new_category_id, 'action', 'station created');

      WHEN 'REMOVE_FROM_SHEET' THEN
        -- Re-verify the parent sheet is still DRAFT at apply time.
        SELECT di.id INTO v_today_sheet
        FROM public.daily_inventory_items dii
        JOIN public.daily_inventory di ON dii.daily_inventory_id = di.id
        WHERE dii.id = (v_rec.payload->>'daily_inventory_item_id')::uuid AND di.state = 'DRAFT';
        IF v_today_sheet IS NULL THEN
          RAISE EXCEPTION 'The worksheet entry is gone or its sheet was finalized since the request was submitted.';
        END IF;
        DELETE FROM public.daily_inventory_items WHERE id = (v_rec.payload->>'daily_inventory_item_id')::uuid;
        v_result_summary := jsonb_build_object('daily_inventory_item_id', v_rec.payload->>'daily_inventory_item_id', 'action', 'entry removed from worksheet');
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.staff_change_requests
    SET status = 'FAILED',
        reviewed_by = v_caller_id,
        review_notes = v_clean_notes,
        decision_reason = 'Apply failed: ' || SQLERRM,
        updated_at = now()
    WHERE id = v_rec.id;

    INSERT INTO public.security_events (
      event_type, email_masked, actor_id, details
    ) VALUES (
      'STAFF_CHANGE_REQUEST_APPLY_FAILED',
      public.mask_email(COALESCE((SELECT email FROM auth.users WHERE id = v_rec.requested_by), 'staff')),
      v_caller_id,
      jsonb_build_object('request_id', v_rec.id, 'error', SQLERRM)
    );

    RETURN jsonb_build_object(
      'success', false,
      'applied', false,
      'status', 'FAILED',
      'message', 'The request was approved but the change could not be applied: ' || SQLERRM
    );
  END;

  UPDATE public.staff_change_requests
  SET status = 'APPROVED',
      reviewed_by = v_caller_id,
      review_notes = NULLIF(v_clean_notes, ''),
      applied_at = now(),
      result_summary = v_result_summary,
      updated_at = now()
  WHERE id = v_rec.id;

  INSERT INTO public.notifications (
    type, title, message, target_id, user_id, dedup_key, created_at
  ) VALUES (
    'STAFF_CHANGE_REQUEST_DECISION',
    format('Your %s request was approved and applied', v_rec.request_type),
    'The administrator approved your request and the change is now live in the system.',
    '/daily-inventory',
    v_rec.requested_by,
    format('staff_change_decision_%s', v_rec.id),
    now()
  );

  INSERT INTO public.security_events (
    event_type, email_masked, actor_id, details
  ) VALUES (
    'STAFF_CHANGE_REQUEST_APPLIED',
    public.mask_email(COALESCE((SELECT email FROM auth.users WHERE id = v_rec.requested_by), 'staff')),
    v_caller_id,
    jsonb_build_object('request_id', v_rec.id, 'result', v_result_summary)
  );

  v_message := format('Request approved and applied: %s', COALESCE(v_result_summary->>'action', v_rec.request_type));

  RETURN jsonb_build_object(
    'success', true,
    'applied', true,
    'status', 'APPROVED',
    'message', v_message,
    'result_summary', v_result_summary
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_staff_change_request(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. ROLE BOUNDARY — direct client writes to structure are blocked; definer
--    RPCs remain the only staff write paths. (Drops use IF EXISTS so both the
--    initial-schema and 20260906050000 variants are covered.)
-- ----------------------------------------------------------------------------
-- inventory_items: read for everyone, write for admins only.
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable insert for admins" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable update for admins" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable delete for admins" ON public.inventory_items;
CREATE POLICY "Admins manage inventory items"
  ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update inventory items"
  ON public.inventory_items FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete inventory items"
  ON public.inventory_items FOR DELETE TO authenticated USING (public.is_admin());

-- categories: same boundary (suppliers/system_settings were already admin-only).
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable insert for admins" ON public.categories;
DROP POLICY IF EXISTS "Enable update for admins" ON public.categories;
DROP POLICY IF EXISTS "Enable delete for admins" ON public.categories;
CREATE POLICY "Admins manage categories"
  ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update categories"
  ON public.categories FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete categories"
  ON public.categories FOR DELETE TO authenticated USING (public.is_admin());

-- stock_batches: physical stock rows are created only through definer RPCs.
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.stock_batches;
CREATE POLICY "Admins create stock batches"
  ON public.stock_batches FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- daily_inventory: sheet/station creation is structural.
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.daily_inventory;
CREATE POLICY "Admins create daily inventory sheets"
  ON public.daily_inventory FOR INSERT TO authenticated WITH CHECK (public.is_admin());
-- Tighten sheet updates too: staff never change sheet state.
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory;

-- daily_inventory_items: staff keep row-level editing of the operational
-- columns on DRAFT sheets (policy below) but never INSERT/DELETE rows.
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.daily_inventory_items;
DROP POLICY IF EXISTS "Users can delete daily_inventory_items if parent is DRAFT" ON public.daily_inventory_items;
CREATE POLICY "Admins manage worksheet rows"
  ON public.daily_inventory_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete worksheet rows"
  ON public.daily_inventory_items FOR DELETE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory_items;

-- daily_inventory_revisions: written only by definer RPCs.
DROP POLICY IF EXISTS "Authenticated users can insert daily inventory revisions" ON public.daily_inventory_revisions;
CREATE POLICY "Admins insert daily inventory revisions"
  ON public.daily_inventory_revisions FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. TRIGGER — staff worksheet edits may only touch operational columns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_daily_inventory_item_edits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.beg IS DISTINCT FROM OLD.beg
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.daily_inventory_id IS DISTINCT FROM OLD.daily_inventory_id THEN
    RAISE EXCEPTION 'Only administrators can modify worksheet structure (beginning counts, item or station assignment). Submit a change request instead.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_editable_daily_items ON public.daily_inventory_items;
CREATE TRIGGER trg_staff_editable_daily_items
  BEFORE UPDATE ON public.daily_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_daily_inventory_item_edits();

-- Reload schema cache so PostgREST exposes the replaced functions immediately.
NOTIFY pgrst, 'reload schema';

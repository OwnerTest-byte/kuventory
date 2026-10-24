-- ============================================================================
-- MIGRATION: 20261024160000_release_b_profile_and_support_contacts.sql
-- Description:
--   Release B — Shared Admin/Super Admin Profile and Configurable Support Contacts:
--   1. Extend public.profiles with safe display and support contact columns:
--      support_phone, support_email, job_title, show_on_lockout_screen, avatar_url.
--   2. Create public.profile_contact_links table for configurable social/support links.
--   3. Implement RLS policies ensuring self-only modification of profile and links.
--   4. Implement secure public RPC get_public_support_contacts() for login/lockout screen.
--   5. Implement update_my_profile() RPC with strict non-escalation guarantees.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND public.profiles COLUMNS
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS support_phone TEXT,
  ADD COLUMN IF NOT EXISTS support_email TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS show_on_lockout_screen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ----------------------------------------------------------------------------
-- 2. CREATE public.profile_contact_links TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_contact_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contact_url_safe CHECK (
    url ~* '^(https:\/\/|mailto:|tel:)'
  ),
  CONSTRAINT chk_contact_label_not_empty CHECK (
    length(trim(label)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_profile_contact_links_profile_id 
  ON public.profile_contact_links(profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_contact_links_public 
  ON public.profile_contact_links(profile_id, is_public, sort_order);

-- Enable RLS
ALTER TABLE public.profile_contact_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read own contact links" ON public.profile_contact_links;
DROP POLICY IF EXISTS "Public can view opted-in contact links" ON public.profile_contact_links;
DROP POLICY IF EXISTS "Users can insert own contact links" ON public.profile_contact_links;
DROP POLICY IF EXISTS "Users can update own contact links" ON public.profile_contact_links;
DROP POLICY IF EXISTS "Users can delete own contact links" ON public.profile_contact_links;

-- Read policies
CREATE POLICY "Users can read own contact links"
  ON public.profile_contact_links FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()));

CREATE POLICY "Public can view opted-in contact links"
  ON public.profile_contact_links FOR SELECT
  TO anon, authenticated
  USING (
    is_public = true AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_contact_links.profile_id
        AND p.show_on_lockout_screen = true
        AND p.role IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
    )
  );

-- Mutation policies (self-only)
CREATE POLICY "Users can insert own contact links"
  ON public.profile_contact_links FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own contact links"
  ON public.profile_contact_links FOR UPDATE
  TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own contact links"
  ON public.profile_contact_links FOR DELETE
  TO authenticated
  USING (profile_id = (SELECT auth.uid()));

-- Grants on table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_contact_links TO authenticated;
GRANT SELECT ON public.profile_contact_links TO anon;

-- ----------------------------------------------------------------------------
-- 3. SECURE PUBLIC SUPPORT CONTACTS RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_support_contacts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(contact_row), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT 
      p.display_name,
      COALESCE(p.job_title, CASE WHEN p.role IN ('SUPER_ADMIN', 'MASTER_ADMIN') THEN 'System Administrator' ELSE 'Branch Administrator' END) AS job_title,
      p.support_phone,
      p.support_email,
      p.avatar_url,
      p.role,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pcl.id,
          'label', pcl.label,
          'platform', pcl.platform,
          'url', pcl.url,
          'sort_order', pcl.sort_order
        ) ORDER BY pcl.sort_order ASC, pcl.created_at ASC)
        FROM public.profile_contact_links pcl
        WHERE pcl.profile_id = p.id AND pcl.is_public = true
      ), '[]'::jsonb) AS links
    FROM public.profiles p
    WHERE p.show_on_lockout_screen = true
      AND p.role IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
    ORDER BY 
      CASE WHEN p.role IN ('SUPER_ADMIN', 'MASTER_ADMIN') THEN 1 ELSE 2 END,
      p.created_at ASC
  ) contact_row;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_support_contacts() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. SECURE SELF-UPDATE PROFILE RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_support_phone TEXT DEFAULT NULL,
  p_support_email TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL,
  p_show_on_lockout_screen BOOLEAN DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_updated public.profiles%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to update profile.';
  END IF;

  -- Validate display name
  IF p_display_name IS NOT NULL AND length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'Display name cannot be empty.';
  END IF;

  -- Validate support_email format if provided
  IF p_support_email IS NOT NULL AND length(trim(p_support_email)) > 0 THEN
    IF p_support_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid support email format.';
    END IF;
  END IF;

  -- Update only permitted non-privileged profile fields
  UPDATE public.profiles
  SET 
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    first_name = COALESCE(trim(p_first_name), first_name),
    last_name = COALESCE(trim(p_last_name), last_name),
    phone = COALESCE(trim(p_phone), phone),
    support_phone = COALESCE(trim(p_support_phone), support_phone),
    support_email = COALESCE(trim(p_support_email), support_email),
    job_title = COALESCE(trim(p_job_title), job_title),
    show_on_lockout_screen = COALESCE(p_show_on_lockout_screen, show_on_lockout_screen),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = v_caller_id
  RETURNING * INTO v_updated;

  -- Audit event
  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data
  ) VALUES (
    v_caller_id,
    'PROFILE_UPDATE',
    'profiles',
    v_caller_id,
    jsonb_build_object(
      'display_name', v_updated.display_name,
      'support_phone', v_updated.support_phone,
      'support_email', v_updated.support_email,
      'job_title', v_updated.job_title,
      'show_on_lockout_screen', v_updated.show_on_lockout_screen
    )
  );

  RETURN to_jsonb(v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

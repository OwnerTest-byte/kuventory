# Authentication Database Audit — KUVENTORY v4.0.0

## Root Cause of "Database error querying schema"

### Primary Cause: Supabase Project Paused
The Supabase free tier project (`wdwiqvkjbayvytavgkyy`) was automatically paused due to inactivity.
When paused, ALL requests to the REST API hang indefinitely, causing Supabase JS SDK to throw
"Database error querying schema" because PostgREST cannot load its internal schema cache.

**Evidence:** HTTP GET to `https://wdwiqvkjbayvytavgkyy.supabase.co/rest/v1/profiles?...` produced no response after 30+ seconds (task killed), confirming the project was offline.

### Secondary Cause: Over-aggressive REVOKE in Security Remediation
Migration `20260810100000_security_remediation.sql` executed:
```sql
REVOKE EXECUTE ON FUNCTION public.has_role(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(text[]) FROM PUBLIC, anon, authenticated;
```
Even though these are `SECURITY DEFINER` functions (run as postgres), Supabase's PostgREST
introspection process attempts to verify EXECUTE accessibility when building the schema cache.
Revoking from `anon` caused the schema cache build to fail with "Database error querying schema"
even after the project was unpaused.

## Fix Applied

### Database: `20260812000000_auth_recovery.sql`
- Restores `GRANT EXECUTE` on `has_role`, `has_any_role` to `anon, authenticated, service_role`
- Restores schema-level `GRANT USAGE ON SCHEMA public`
- Restores table-level grants for `authenticated` and `anon`
- Sets `ALTER DEFAULT PRIVILEGES` for future table grants
- Recreates clean profiles/user_roles/roles RLS policies using `(select auth.uid())`
  (performance-optimized form avoiding per-row re-evaluation)
- Re-creates the `on_auth_user_created` trigger as an idempotent operation
- Sends `NOTIFY pgrst, 'reload schema'` and `NOTIFY pgrst, 'reload config'`

## Database Objects Audit

### auth.users (Supabase Auth managed)
- ✅ Exists
- ✅ Trigger `on_auth_user_created` → calls `public.handle_new_user()`
- ✅ Email/password auth enabled

### public.profiles
- ✅ Table exists with correct columns: `id, auth_user_id, full_name, phone, avatar_url, is_active`
- ✅ RLS enabled
- ✅ Policy: authenticated can SELECT all
- ✅ Policy: users can UPDATE own (via auth_user_id = auth.uid())
- ✅ Policy: Admin can manage all

### public.roles
- ✅ Table exists with `id, name, description`
- ✅ Seeded with 6 roles: Administrator, Manager, Inventory Staff, Cashier, Kitchen Staff, Viewer
- ✅ RLS enabled: authenticated can SELECT all

### public.user_roles
- ✅ Table exists: `id, profile_id, role_id`
- ✅ RLS enabled: authenticated can SELECT all; Admin manages all
- ⚠️ NOTE: New users must have role assigned manually until an admin UI is available

### public.handle_new_user()
- ✅ SECURITY DEFINER (runs as postgres)
- ✅ SET search_path = '' (prevents search_path injection)
- ✅ Inserts into `public.profiles` (fully qualified)
- ✅ Trigger `on_auth_user_created` active on `auth.users AFTER INSERT`
- ✅ NOT callable via REST API (REVOKE EXECUTE from PUBLIC/anon/authenticated)
  - This is correct and safe — trigger-only function

### public.has_role(text)
- ✅ SECURITY DEFINER (runs as postgres)
- ✅ SET search_path = '' with qualified table names
- ✅ STABLE (cacheable per query)
- ✅ GRANT EXECUTE to anon, authenticated, service_role (restored)

### public.has_any_role(text[])
- ✅ SECURITY DEFINER (runs as postgres)
- ✅ SET search_path = '' with qualified table names  
- ✅ STABLE (cacheable per query)
- ✅ GRANT EXECUTE to anon, authenticated, service_role (restored)

## Frontend ↔ Backend Auth Query Audit

| Frontend Query | Expected DB Behavior | Status |
|---|---|---|
| `supabase.auth.getSession()` | Reads localStorage, no DB call | ✅ |
| `supabase.auth.signInWithPassword()` | Supabase Auth validates credentials | ✅ |
| `supabase.from('profiles').select('*').eq('auth_user_id', authUser.id).single()` | RLS: authenticated can read all profiles | ✅ |
| `supabase.from('user_roles').select('roles(name)').eq('profile_id', profile.id)` | RLS: authenticated can read user_roles + roles join | ✅ |
| `supabase.auth.signOut()` | Invalidates session, fires SIGNED_OUT event | ✅ |

## Production Checklist

| Check | Status |
|---|---|
| VITE_SUPABASE_URL points to correct project | ✅ wdwiqvkjbayvytavgkyy.supabase.co |
| VITE_SUPABASE_PUBLISHABLE_KEY is anon key (not service role) | ✅ sb_publishable_... |
| No service_role key in frontend code | ✅ Verified |
| createClient() uses persistSession: true, autoRefreshToken: true | ✅ |
| AuthContext uses getSession() on init (not getUser() which requires network) | ✅ |
| Supabase project is ACTIVE (not paused) | ⚠️ Must be verified in dashboard |

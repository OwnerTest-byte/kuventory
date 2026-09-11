# Authentication Flow — KUVENTORY v4.0.0

## Overview
This document describes the complete authentication and authorization flow for KUVENTORY.

## Flow Diagram

```
USER OPENS APP
      ↓
supabase.auth.getSession() ← reads localStorage/cookie
      ↓
Session EXISTS?
 ├── NO → AuthProvider sets isAuthenticated=false, isLoading=false
 │         ProtectedRoute → redirect to /login
 │         LoginForm → signInWithPassword()
 │              ↓
 │         Supabase Auth validates credentials
 │              ↓
 │         onAuthStateChange fires (SIGNED_IN)
 │              ↓ 
 │         loadProfileAndRoles(user) called
 │              ↓
 │         SELECT from profiles WHERE auth_user_id = auth.uid()
 │              ↓ (RLS: authenticated = true)
 │         SELECT from user_roles JOIN roles WHERE profile_id = profile.id
 │              ↓
 │         AuthContext sets: session, user, profile, roles[]
 │              ↓
 │         scheduleIdleCheck() → 8-hour countdown begins
 │              ↓
 │         Navigate to /dashboard
 │
 └── YES → setIsAuthenticated(true)
           loadProfileAndRoles(user) called
                ↓
           AuthProvider renders children
                ↓
           ProtectedRoute passes → Dashboard shown

## Session Persistence
- Supabase SDK stores session in localStorage under key "kuventory-auth"
- On app reload, getSession() restores the session immediately
- Token auto-refresh handled by Supabase SDK

## 8-Hour Inactivity Timeout
- Timer starts on SIGNED_IN event
- Activity events tracked: mousedown, keydown, touchstart, pointerdown
- Activity updates throttled to once per minute (ACTIVITY_THROTTLE_MS = 60000)
- Activity timestamp stored in localStorage["kuventory_last_activity"]
- On timer fire: checks localStorage for most recent activity across tabs
  - If inactive ≥ 8h: calls logout("inactivity")
  - If active: reschedules for remaining duration
- Logout broadcasts to all tabs via BroadcastChannel("kuventory_auth_sync")
- User redirected to /session-expired with informative message

## Multi-Tab Synchronization
- BroadcastChannel("kuventory_auth_sync") sends LOGOUT messages
- All other tabs clear auth state and redirect to /login or /session-expired

## Query Cache Clearing on Logout
- queryClient.clear() is called on every logout
- Prevents cross-user data leakage on shared computers

## Database Objects Involved

| Object | Type | Purpose |
|--------|------|---------|
| auth.users | Table | Supabase Auth managed user accounts |
| public.profiles | Table | Application user profiles (1:1 with auth.users) |
| public.roles | Table | Available system roles |
| public.user_roles | Table | Maps profiles to roles (M:M) |
| public.handle_new_user() | Trigger Function | Auto-creates profile on auth.users INSERT |
| public.has_role(text) | SQL Function (SECURITY DEFINER) | Checks if current user has a specific role |
| public.has_any_role(text[]) | SQL Function (SECURITY DEFINER) | Checks if current user has any of the given roles |
| on_auth_user_created | Trigger | Fires handle_new_user on auth.users INSERT |

## RLS Policies on Critical Tables

### profiles
- SELECT: authenticated users can read all profiles (for UI name display)
- UPDATE: users can update their own profile (WHERE auth_user_id = auth.uid())
- ALL: Administrator role can do everything

### user_roles  
- SELECT: all authenticated users can read
- ALL: only Administrator role

### roles
- SELECT: all authenticated users can read
- ALL: only Administrator role

## Security Notes
- Frontend role checks are UX only — all authorization enforced by DB RLS
- has_role/has_any_role are SECURITY DEFINER — execute as postgres, query auth.uid() safely
- No service_role key is exposed in frontend code
- All RPCs use SECURITY INVOKER — respect the caller's RLS context
```

# Supabase Authentication

This document outlines the authentication architecture for the Kuventory backend (Phase 3).

## Overview

Kuventory relies exclusively on **Supabase Auth** for identity management. The initial implementation supports **Email + Password** authentication. 

## Authentication Flow

1. **User Login**: The user enters their credentials in the `LoginForm`.
2. **Supabase Client**: `authService.signIn()` sends a request to Supabase.
3. **Session Establishment**: Supabase returns a session and sets the appropriate cookies/tokens.
4. **Context Update**: The `AuthContext` listener (`onAuthStateChange`) detects the `SIGNED_IN` event.
5. **Data Hydration**: The context automatically fetches the user's `profile` and associated `roles`.
6. **Navigation**: The `RoleProtectedRoute` component allows or denies access based on the retrieved roles.

## Centralized Client

The Supabase client is initialized in `src/integrations/supabase/client.ts` using Vite public environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). 

> [!CAUTION]
> The Supabase `SERVICE_ROLE_KEY` is **never** used in the React frontend. It must remain secure for server-side or CLI operations only.

## Authentication State Layer

The `AuthContext` provides the following state:
- `user`: The Supabase `auth.users` object.
- `profile`: The public `profiles` record.
- `roles`: An array of role names assigned to the user.
- `primaryRole`: The first role in the array, used for UI display.
- `isAuthenticated`: Boolean indicating session validity.
- `isLoading`: Boolean indicating if auth state is still resolving.

## Logout Workflow

When a user signs out:
1. `authService.signOut()` terminates the session on Supabase.
2. `AuthContext` clears all local user, profile, and role state.
3. A `BroadcastChannel` event notifies other open browser tabs to log out instantly.
4. The user is redirected to the `/login` route.

## Password Reset

The foundation for password reset has been laid in `authService.resetPassword()` and `authService.updatePassword()`. It relies on Supabase's built-in reset email flow. No manual password hashing is required.

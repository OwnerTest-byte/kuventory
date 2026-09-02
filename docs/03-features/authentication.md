# Authentication & Role Handling

## Overview
KUVENTORY relies on **Supabase GoTrue Auth** for handling identity and secure session management via JSON Web Tokens (JWT). The frontend application wraps this mechanism to provide secure routing and role-based component rendering, but relies entirely on PostgreSQL Row Level Security (RLS) for true authorization.

## Authentication Flow
1. **Login**: Users authenticate using their email and password at `/login`.
2. **Session Persistence**: The `supabase-js` client automatically persists the session using `localStorage`. 
3. **Rehydration**: On application load, `AuthContext` uses `supabase.auth.getSession()` and `onAuthStateChange` to rehydrate the user's session globally.

## Profile & Role Resolution
User roles (`ADMIN` or `USER`) are not stored in the JWT by default. Instead, they exist in the `public.profiles` table, which is updated securely by backend database triggers upon user creation.

When a user logs in, `AuthContext` fetches the corresponding profile using `@tanstack/react-query`:
- Key: `['profile', userId]`
- The profile cache is cleared automatically on logout.
- This limits unnecessary repeated profile fetches while navigating the application.

## Frontend Security Boundary
The React application enforces role-based access for UX purposes:
- **`RequireAuth`**: Redirects unauthenticated users to `/login`.
- **`RequireAdmin`**: Displays an "Access Denied" screen if a non-ADMIN attempts to load admin-only routes (e.g. `/admin`).

> [!WARNING]
> Frontend route protection is purely cosmetic. A malicious user could bypass the frontend routing by sending manual API requests or altering React state. True security is enforced exclusively by the backend RLS policies established in Phase 02.

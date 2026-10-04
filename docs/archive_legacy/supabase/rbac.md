# Role-Based Access Control (RBAC) Architecture

This document describes the foundational RBAC architecture implemented in Phase 3 of Kuventory.

## Database Tables

The role system is backed by two database tables:
1. **`roles`**: Defines the available application roles (e.g., Administrator, Manager).
2. **`user_roles`**: A junction table linking a `profile_id` to a `role_id`.

## User Role Assignment

Users can have one or more roles assigned via the `user_roles` table. 
For the initial workflow, a user typically operates under a primary role, though the database schema supports multi-role complexity for future expansion.

## Role Resolution Utility

The frontend uses `src/utils/rbac.ts` to manage role evaluations.

```typescript
export function hasAnyRole(userRoles: RoleName[], allowedRoles: RoleName[]): boolean {
  return allowedRoles.some((role) => userRoles.includes(role));
}
```

This ensures that hardcoded email checks (e.g., `user.email === 'admin@example.com'`) are never used. Security relies entirely on database state.

## Role-Protected Routes

In React, the `RoleProtectedRoute` component wraps sections of the application that require specific roles:

```tsx
<Route element={<RoleProtectedRoute allowedRoles={["Administrator", "Manager"]} />}>
  <Route path="/settings" element={<SettingsLayout />} />
</Route>
```

If a user lacks the required role, they are automatically redirected to the `/unauthorized` route.

## UI Navigation

The Sidebar navigation (`src/components/navigation/config.ts`) uses the same RBAC logic to filter visible links. Users will only see navigation items they are permitted to access.

> [!WARNING]
> Frontend route protection is **not** a complete security boundary. It exists for UX purposes. True data security will be implemented in Phase 4 via Supabase Row Level Security (RLS) policies.

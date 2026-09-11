# User Profiles Architecture

This document explains how user identities in Kuventory map to application profiles.

## Architecture

Supabase splits user identity into two layers:
1. **`auth.users`**: Managed by Supabase internally. Stores secure credentials, emails, passwords, and raw metadata.
2. **`public.profiles`**: Managed by Kuventory. Stores application-specific data like full name, phone number, and avatar URL.

## The Profile Trigger

To ensure that every authenticated user has a corresponding profile, a PostgreSQL trigger function (`handle_new_user`) executes automatically whenever a new row is inserted into `auth.users`.

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

The trigger reads the `NEW.id` (UUID) from the auth schema and uses it as the `auth_user_id` foreign key in the `profiles` table.

## Frontend Hydration

When a user logs in, the `AuthContext`:
1. Receives the `Session` from Supabase.
2. Extracts the `user.id`.
3. Queries the `public.profiles` table for `auth_user_id = user.id`.
4. Attaches this profile to the global React state.

## Security Considerations

> [!IMPORTANT]
> Passwords, API tokens, and sensitive security details are **never** stored in `public.profiles`. The `profiles` table is designed to be readable by the authenticated user and optionally other users (depending on future RLS policies) for UI purposes.

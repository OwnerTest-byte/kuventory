# Authentication Troubleshooting

## Problem
Supabase Auth returned `HTTP 500` while attempting password authentication (`/auth/v1/token?grant_type=password`).

Exact error from logs:
`error finding user: sql: Scan error on column index 3, name "confirmation_token": converting NULL to string is unsupported`

## Cause
The error occurs because the GoTrue Go backend expects token fields like `confirmation_token`, `recovery_token`, `email_change_token_new`, and `email_change` to be empty strings (`""`) rather than `NULL`. 
Since these users were seeded directly into `auth.users` without explicitly setting the token fields to `""`, they defaulted to `NULL`, which crashed the Supabase Auth login flow during the scan into the struct.

## Solution
A database migration was applied (`20260812110000_fix_auth_token_defaults.sql`) using a `BEFORE INSERT` trigger on the `auth.users` table to enforce default values of `''` instead of `NULL` for these token fields. This approach was used because standard migration roles lack ownership of `auth.users` and cannot issue `ALTER TABLE ... SET DEFAULT` commands. 

Existing users were already fixed by a prior migration (`20260812100000_fix_auth_null_tokens.sql`) that issued an `UPDATE` on existing `NULL` tokens.

## Tested Scenarios
1. **Existing users**: Tested with `admin@kapeuno.com`, successfully receives `HTTP 200` upon authentication.
2. **New users**: A test user `newuser@kapeuno.com` signed up via Supabase Auth API received empty strings (`""`) rather than `NULL` for tokens thanks to the trigger.

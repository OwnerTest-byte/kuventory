# Row Level Security (RLS) Architecture

This document explains how PostgreSQL Row Level Security (RLS) is implemented in Kuventory.

## Overview

Frontend UI restrictions are not sufficient for security. To ensure data safety, we use PostgreSQL Row Level Security (RLS) to enforce authorization directly at the database level. When an authenticated user connects via the Supabase client, their identity (`auth.uid()`) is evaluated against defined policies before any data is accessed or mutated.

## Secure Role Lookup

Kuventory uses custom PostgreSQL `SECURITY DEFINER` functions to resolve user roles without causing infinite recursion in RLS policy evaluation:

- `public.has_role(role_name text)`
- `public.has_any_role(role_names text[])`

Because they are marked `SECURITY DEFINER`, these functions run with elevated privileges (bypassing RLS internally) but safely expose only a boolean response based on the `user_roles` linking table.

## Policy Strategy

- **Default Deny**: All tables that contain business data have RLS enabled. By default, this blocks all `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations.
- **Explicit Allow**: We add explicit policies to grant access. For example:
  ```sql
  CREATE POLICY "Stock items viewable by authenticated users" 
    ON stock_items FOR SELECT TO authenticated USING (true);
    
  CREATE POLICY "Stock items managed by Admin/Mgr/Inv" 
    ON stock_items FOR ALL TO authenticated 
    USING (public.has_any_role(ARRAY['Administrator', 'Manager', 'Inventory Staff']));
  ```

## Critical Table Policies

### Inventory Balances
To prevent insecure client-side modifications (like updating quantities manually), **NO UPDATE POLICY** is granted to any user for `inventory_balances`. Client mutations will only be permitted via secure RPC functions (implemented in Phase 5).

### Stock Movements
The `stock_movements` table is an immutable audit log. Normal users are only granted `SELECT` and `INSERT` privileges. `UPDATE` and `DELETE` are strictly denied except for Administrators.

### Profiles
Users can view all profiles (necessary for resolving names in the UI) but can only `UPDATE` their own profile row.

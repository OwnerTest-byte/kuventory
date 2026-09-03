# Authorization and Role Model

KUVENTORY supports exactly two roles: `ADMIN` and `USER`.
Roles are strictly assigned and stored in the `profiles` table.

## Role Assignment

When a user signs up or is invited, their entry in `auth.users` triggers a PostgreSQL function that creates a row in `public.profiles`. The first user created might default to `ADMIN`, and subsequent users to `USER`, or they are explicitly assigned by an existing `ADMIN`.

## Permission Matrix

| Module               | Action            | USER | ADMIN | Rationale                                                                                   |
| -------------------- | ----------------- | ---- | ----- | ------------------------------------------------------------------------------------------- |
| **Inventory Master** | View              | Yes  | Yes   | Users need to see items for daily counts.                                                   |
| **Inventory Master** | Create/Edit       | No   | Yes   | Prevents operational users from messing up standard items.                                  |
| **Categories**       | View              | Yes  | Yes   | Needed for filtering.                                                                       |
| **Categories**       | Create/Edit       | No   | Yes   | Master data control.                                                                        |
| **Daily Inventory**  | Create Draft      | Yes  | Yes   | Core operational duty.                                                                      |
| **Daily Inventory**  | Edit AM/PM        | Yes  | Yes   | Core operational duty.                                                                      |
| **Daily Inventory**  | Finalize          | Yes  | Yes   | Users lock their shift counts.                                                              |
| **Daily Inventory**  | Correct Finalized | No   | Yes   | Only admins can make historical corrections.                                                |
| **Reports**          | View Current      | Yes  | Yes   | Users need their daily output.                                                              |
| **Reports**          | View Archives     | No   | Yes   | Operational users don't need historical visibility.                                         |
| **Users**            | View/Manage       | No   | Yes   | Strictly administrative.                                                                    |
| **Stock Adjust**     | Manual Adj.       | No   | Yes   | Only admins can manually override stock quantities outside of the Daily Inventory workflow. |

## RLS Implementation Pattern

Example of an RLS Policy on `inventory_items`:

```sql
-- Allows everyone to read
CREATE POLICY "inventory_items_read" ON inventory_items
  FOR SELECT USING (true);

-- Allows only ADMIN to insert
CREATE POLICY "inventory_items_insert" ON inventory_items
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN'
  );
```

For complex logic, we cache the role lookup or use a custom JWT claim to avoid excessive joins on the `profiles` table during heavily filtered queries.

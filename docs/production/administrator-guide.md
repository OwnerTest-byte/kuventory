# Kuventory - Administrator Guide

## User & Role Management
As an Administrator, you have the ability to govern the `user_roles` linking Supabase `auth.users` to their respective authorization levels. 
- You should assign the `Administrator` role sparingly.
- When onboarding a new user, register them in Supabase Auth, fetch their `user_id`, and insert a row associating them with a role like `Cashier` or `Inventory Staff`.

## Inventory Governance
- **Categories & Units**: Keep categories clean and structured. Duplicate categories can fragment reports.
- **Suppliers & Discounts**: Setup Supplier-wide discount policies prior to processing bulk purchases to automate cost reductions safely.

## Financial & Cash Operations
- **Cash Sessions**: Ensure Cashiers close their shift at the end of the day. Orphaned cash sessions will not carry over correctly across days in rigid accounting views.
- **Voiding Sales**: Administrators and Managers can void sales. A voided sale returns inventory quantities atomically.

## Audit Logs
All critical actions (Logins, Role changes, Stock Transfers, Purchases, Sales) are logged to the `audit_logs` table. You can query this table in the Supabase Dashboard to investigate discrepancies.

## Settings & Notifications
System thresholds, such as low stock warnings, generate alerts in the `notifications` table. Ensure staff review and mark these notifications as read to prevent UI bloat.

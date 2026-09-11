# Administrator Guide

**Kuventory v2.0.0**

This guide covers advanced configurations and permissions intended for Store Managers and System Administrators.

## Role-Based Access Control
Kuventory utilizes a role-based access system to protect sensitive data and configuration settings.

### 1. Admin / Manager Role
- Full access to all modules, including **Settings**.
- Can create, edit, and delete user accounts.
- Can edit application-wide configurations (e.g., store details, global tax rates).
- Can override locked inventory records if discrepancies are found during auditing.

### 2. Staff Role
- Intended for regular baristas or shift supervisors.
- Can record Sales, Expenses, and daily Inventory counts.
- **Restricted**: Cannot access the `Settings` panel. The link is hidden from the navigation sidebar.

## Settings Module
The settings module (accessible only to Admins) handles:
- **Profile Management**: Updating email and password.
- **User Management**: Creating and revoking access for Staff accounts.
- **System Settings**: Store details.

## Daily Closing Procedures (Admin)
At the end of operations:
1. Ensure the Staff has accurately entered all `AM Sales` and `PM Sales` into the Inventory module.
2. Verify that the auto-calculated `Ending Stock` matches the physical count.
3. Review the `Dashboard` for the consolidated gross and net income.
4. Export the daily Reports (PDF or Excel) for archival and accounting.

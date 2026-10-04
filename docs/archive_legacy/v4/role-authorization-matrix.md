# Role Authorization Matrix (v4.0.0)

This matrix verifies that the frontend role-based access control (RBAC) definitions match the database RLS policies.

| Role (DB & UI) | DB Read Access | DB Write Access (via RPC) | UI Features Enabled |
|---|---|---|---|
| **Administrator** | All Tables | All Operations | User Management, Inventory, Sales, Reporting, Settings |
| **Manager** | All Tables | All Operations (except modifying Admin users) | Inventory, Sales, Reporting, Limited Settings |
| **Cashier** | Sales, Inventory, Cash Sessions, Discounts | Sales (process_sale), Cash Sessions (open/close) | Point of Sale, Cash Drawer, Daily Sales |
| **Inventory Staff** | Inventory, Purchases, Transfers, Suppliers | Purchases (create/receive), Stock Transfers, Inventory Adjustments | Inventory Dashboard, Purchases, Deliveries |
| **Kitchen Staff** | Daily Inventory | Daily Inventory Logs | Kitchen Dashboard, Daily Count |
| **Viewer** | Most Tables (Read Only) | None | Read-only Reports & Dashboards |

### Validation

*   **Enums Matching**: Database role insertions and has_any_role usages exactly match the "Administrator" | "Manager" | "Inventory Staff" | "Cashier" | "Kitchen Staff" | "Viewer" literal strings in src/utils/rbac.ts.
*   **Security Context**: All UI components use AuthContext -> oles to conditionally render based on these literals. Backend enforces it via has_any_role and SECURITY INVOKER RPCs.
*   **Status**: MATCHED.

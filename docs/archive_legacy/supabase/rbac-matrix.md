# Role-Based Access Control (RBAC) Matrix

This document defines the intended role access matrix for Kuventory.

> [!WARNING]
> This is a planning matrix for Phase 3. **Row Level Security (RLS) policies are not yet implemented.** This matrix will serve as the blueprint for RLS policies in Phase 4.

## Core Application Roles

| Role | Description |
|---|---|
| **Administrator** | Full system access. Can manage users, settings, and all modules. |
| **Manager** | Management access to inventory, sales, purchasing, and reports. |
| **Inventory Staff** | Operations access to stock, transfers, and daily inventory. |
| **Cashier** | Sales and cash session operations. |
| **Kitchen Staff** | View-only for stock; can request transfers. |
| **Viewer** | Read-only access to specified reports or views. |

## Module Access Matrix

| Module / Feature | Administrator | Manager | Inventory Staff | Cashier | Kitchen Staff | Viewer |
|---|---|---|---|---|---|---|
| **Dashboard** | Full Access | Full Access | Limited View | Limited View | Limited View | Read-Only |
| **Inventory (Stock Items, Categories)** | CRUD | CRUD | CRUD | Read | Read | Read |
| **Supplies & Vendors** | CRUD | CRUD | CRUD | None | None | None |
| **Stock Movement / Transfers** | CRUD | CRUD | CRUD | Read | Request Only | Read |
| **Purchases** | CRUD | CRUD | CRUD | None | None | Read |
| **Sales** | CRUD | CRUD | Read | CRUD | None | Read |
| **Discounts** | CRUD | CRUD | Read | Read | None | Read |
| **Expenses** | CRUD | CRUD | None | Limited (Add) | None | Read |
| **Cash Monitoring** | CRUD | CRUD | None | CRUD | None | Read |
| **Reports & Analytics** | Full | Full | None | None | None | Read-Only |
| **Users / Roles** | CRUD | Limited (View) | None | None | None | None |
| **Settings** | Full | Full | None | None | None | None |

## Database Table Level Intent (RLS Prep)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Authenticated | System Trigger | Self, Admin | Admin |
| `roles` | Authenticated | Admin | Admin | Admin |
| `user_roles` | Authenticated | Admin | Admin | Admin |
| `stock_items` | Authenticated | Admin, Mgr, Inv | Admin, Mgr, Inv | Admin |
| `sales` | Authenticated | Admin, Mgr, Cashier | Admin, Mgr | Admin |
| `purchases` | Authenticated | Admin, Mgr, Inv | Admin, Mgr | Admin |

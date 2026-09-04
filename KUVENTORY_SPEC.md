# KUVENTORY SPECIFICATION

## System Purpose
KUVENTORY is a practical inventory management system designed to digitize daily inventory recording, stock management, stock monitoring, FEFO-based inventory handling, notifications, archival, and report generation. It focuses purely on inventory and avoids any ERP, accounting, or CRM bloat.

## Scope
### In Scope:
- Authentication & Authorization
- Dashboard
- Daily Inventory
- Inventory Items
- Stock Management
- Categories
- Stock History
- FEFO / Batch Management
- Notifications
- Reports
- Archive
- User Management (Admins only)
- System Settings (Admins only)

### Out of Scope:
- Purchasing & Sales modules
- Supplier/Customer management
- Accounting & Expenses
- Manufacturing & Warehouse ERP
- Payroll, HR, CRM

## Functional Requirements
- Secure Login/Logout via Supabase Auth.
- Create, Read, Update, Archive (CRUA) for Inventory Items and Categories.
- Stock additions, deductions, and physical count adjustments via Atomic Transactions.
- First Expire, First Out (FEFO) logic to automatically prioritize stock consumption.
- A "Daily Inventory" module matching a physical paper worksheet logic (Portion Stock / Per Cases, AM/PM Out).
- An automated immutable snapshot system for Daily Reports.
- Role-based access (Admin vs User) enforced via Database RLS.
- PDF/XLSX/CSV report generation and previews.
- Realtime system notifications (Low Stock, Expiration Warnings).

## Non-Functional Requirements
- **Frontend**: React + TypeScript + Vite.
- **Backend**: Supabase + PostgreSQL.
- **Deployment**: Netlify.
- **UI/UX**: Responsive parity across Desktop, Tablet, and Mobile.
- **Security**: PostgreSQL Row Level Security (RLS) enabled.

## User Roles
1. **Admin**: Can access all areas, manage users, categories, settings, reopen reports, and handle global archival operations.
2. **User**: Can perform daily operational tasks (manage inventory, daily reports, notifications) but cannot access management areas.

## Main Workflows
1. **Daily Inventory Workflow**: User opens Daily Inventory -> enters AM/PM deductions & physical counts -> saves draft -> Admin or User finalizes -> triggers Report Snapshot.
2. **Stock Update Workflow**: User adds stock -> creates stock_batches & stock_transactions -> updates atomic balance -> FEFO engine prioritizes future consumptions.
3. **Report Generation**: Daily reports are generated from snapshots preventing historical mutations when current data changes.

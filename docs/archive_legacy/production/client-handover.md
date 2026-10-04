# Kuventory - Client Handover Document

## System Overview
Kuventory is a robust, responsive, and secure Inventory Management System (IMS). It manages multi-location stock levels, tracks sales and purchases, enforces strict financial atomic transactions, and generates comprehensive analytics and PDF/Excel exports.

## Key Technologies
- **Frontend**: React + Vite, TypeScript, TailwindCSS
- **Backend / Database**: Supabase (PostgreSQL), Row Level Security (RLS), PL/pgSQL RPCs
- **Deployment**: GitHub Pages (Frontend), Supabase Cloud (Backend)

## Authentication & Roles
Users log in securely using Supabase Authentication. There are 4 core roles mapped via the `user_roles` database table:
1. **Administrator**: Full access to settings, roles, all financial reports, and system configuration.
2. **Manager**: Broad access to run operations, void sales, configure discounts, and view analytics.
3. **Inventory Staff**: Focused access to manage stock movements, supplier deliveries, and internal transfers.
4. **Cashier**: Restricted access purely to open cash registers and process direct sales.

## Maintenance Responsibilities
- **Frontend Codebase**: Changes require pushing to the `main` branch on GitHub to trigger a redeployment.
- **Database Backups**: Managed automatically by Supabase (daily backups retained for 7 days).
- **Incident Response**: In case of a database crash, refer to `disaster-recovery.md` and use the Supabase Point-In-Time Restore (PITR) feature.

## Known Limitations
- The system heavily depends on the client's local browser timezone for reports. Ensure devices processing sales have accurate system clocks.
- Offline support is not currently implemented. A stable internet connection is required to interact with the Supabase backend.

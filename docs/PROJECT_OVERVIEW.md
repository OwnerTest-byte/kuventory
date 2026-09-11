# Project Overview

**KAPE-UNO v4.0.0**

## Business Problem
Kape Uno Bistro relies heavily on accurate inventory monitoring, stock movement tracking, and expense recording to maintain its daily operations. Previously, these processes were handled using paper-based logs or disparate spreadsheets. This manual approach often led to:
- Discrepancies between recorded stock and actual stock.
- Lack of real-time visibility into inventory levels.
- Difficulties in tracking daily sales against beginning and ending stock.
- Inefficiencies in consolidating end-of-day reports.

## Solution
KAPE-UNO is a bespoke, enterprise-grade web application developed to digitalize and streamline Kape Uno Bistro's operational workflow. It consolidates inventory management, sales tracking, supplier coordination, and expense monitoring into a single, intuitive platform.

## Objectives
- **Digital Transformation**: Transition from paper-based tracking to a secure, centralized digital system.
- **Workflow Alignment**: Strictly mirror the existing operational workflow (tracking Beginning Stock, Added Stock, AM/PM Sales, and Ending Stock) to minimize staff training time.
- **Error Reduction**: Auto-calculate critical stock and financial metrics to prevent human data-entry errors.
- **Real-Time Analytics**: Provide management with an interactive dashboard for quick insights into business health.

## Architecture & Technology Stack
The application has transitioned from mock data to a fully robust cloud-native architecture:
- **Frontend**: React (Vite), TypeScript, Tailwind CSS, shadcn/ui.
- **Backend / Database**: Supabase (PostgreSQL).
- **State Management**: Zustand, React Query.
- **Authentication**: Supabase Auth (Session-based).
- **Deployment**: GitHub Pages (Frontend).

## Modules
1. **Dashboard**: Real-time business analytics and summary charts.
2. **Inventory Management**: Shift-based stock tracking enforcing strict mathematical constraints on the backend.
3. **Supply Chain**: Management of supplier records and incoming purchase orders.
4. **Finance & Reports**: Tracking of sales, discounts, operational expenses, and detailed exportable reporting.
5. **System Settings**: User profile, roles, activity logs, and application-wide configurations.

## Development & Deployment Guidelines

### GitHub Pages Deployment
The frontend is hosted on GitHub Pages. To ensure proper routing and asset loading:
1. Ensure `vite.config.ts` has the correct `base` path (if deploying to a subdirectory).
2. The `.env` variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be configured in your GitHub Actions Secrets.
3. Push to `main` to trigger the deployment workflow.

### Test Data Management
If you accumulate test data during development or training:
- **DO NOT** manually delete rows in the Supabase Table Editor if you are unsure of cascading constraints.
- A safe SQL script is provided at `docs/supabase/cleanup_test_data.sql` to truncate transactional tables (Sales, Purchases, Movements) while preserving master data (Items, Categories, Suppliers, Users). Run this script via the Supabase SQL Editor.

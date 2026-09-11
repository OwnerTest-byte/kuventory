# Project Roadmap

**Kuventory**

## ✅ Completed: Frontend v2.0.1 (Terminology & Discounts)
- Replaced outdated "Product" terminology with context-appropriate supply and stock terminology.
- Centralized discount management across the system (Senior Citizen, PWD, Drivers, Promos).

## ✅ Completed: Frontend v2.0.0
- Comprehensive React SPA structure built with Vite and Tailwind.
- Dashboard with real-time (mock) analytics.
- Inventory, Sales, Expenses, and Purchases modules developed.
- Business workflow strictly aligned to Kape Uno Bistro's metrics.
- UI/UX polished, responsive, and accessible.
- Automated deployment to GitHub Pages configured.

---

## 🚀 Next Phase: Backend Integration

### Backend Developer 1: Authentication & Core Infrastructure
- Setup Django (Previous backend architecture discarded. New backend architecture pending.) project and PostgreSQL (Previous backend architecture discarded. New backend architecture pending.) database schema.
- Implement DRF token authentication (JWT).
- Establish base API routing and permission classes.

### Backend Developer 2: Inventory & Supply Chain
- Create Django (Previous backend architecture discarded. New backend architecture pending.) models for Inventory Items, Categories, and Suppliers.
- Implement CRUD endpoints for Inventory and Purchases.
- Enforce business logic constraints (e.g., Total Stock = Beginning + Added) at the database/ORM level.

### Backend Developer 3: Sales & Finance
- Create models for Sales, Sale Items, Discounts, and Expenses.
- Implement endpoints to record transactions.
- Implement logic to deduct `Ending Stock` based on recorded Sales.

### Backend Developer 4: Reporting & Analytics
- Create aggregated endpoints (`/api/sales/summary`, `/api/reports/`).
- Optimize database queries for dashboard metrics to ensure fast load times.

### Backend Developer 5: Frontend API Integration
- Swap out `frontend/src/services/mock*.ts` with actual `axios` calls targeting the DRF endpoints.
- Map the backend JWT token logic to the frontend `AuthContext`.

---

## 🧪 Testing Phase
- Implement Pytest unit tests for all DRF endpoints.
- Conduct End-to-End (E2E) testing on the integrated frontend-backend stack.
- Perform User Acceptance Testing (UAT) with Kape Uno Bistro staff.

## 🏁 Production Launch
- Provision production server environment (e.g., AWS, GCP, or DigitalOcean).
- Setup Dockerized deployment with Nginx and Gunicorn.
- Final data migration and go-live.


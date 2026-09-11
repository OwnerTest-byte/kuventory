# API Preparation Guide

**Kuventory v2.0.0**

This document serves as a contract and preparation guide for the upcoming backend integration phase. It outlines the current mock service layer and the expected REST API endpoints that the Django (Previous backend architecture discarded. New backend architecture pending.) backend must implement.

## The Mock Service Layer
Currently, the frontend retrieves data via mock services located in `frontend/src/services/`. These services return Promises simulating network latency and resolve with hardcoded JSON data arrays.

**To integrate the real backend, developers will replace the contents of these mock services with standard `axios` calls.**

## Expected REST Endpoints

### 1. Authentication
- `POST /api/auth/login/`
  - **Body**: `{ username, password }`
  - **Response**: `{ access_token, refresh_token, user: { id, role, name } }`
- `POST /api/auth/logout/`
  - **Response**: `200 OK` (Invalidates refresh cookie)
- `POST /api/auth/refresh/`
  - **Response**: `{ access_token }`

### 2. Inventory Management
- `GET /api/inventory/`
  - **Response**: `InventoryItem[]`
- `POST /api/inventory/`
  - **Body**: `InventoryFormData`
  - **Response**: `InventoryItem`
- `PUT /api/inventory/{id}/`
- `DELETE /api/inventory/{id}/`

### 3. Sales
- `GET /api/sales/`
- `POST /api/sales/`
  - **Body**: `SaleFormData` (includes nested `SaleItem[]`)
- `GET /api/sales/summary/`
  - **Response**: `SalesSummaryData` (Aggregated metrics for the dashboard)

### 4. Expenses & Categories
- `GET /api/expenses/`
- `POST /api/expenses/`
- `GET /api/expenses/categories/`

### 5. Suppliers & Purchases
- `GET /api/suppliers/`
- `GET /api/purchases/`

## Data Models
The frontend expects strict JSON responses that match the TypeScript interfaces defined in `frontend/src/types/`. The backend models (Django (Previous backend architecture discarded. New backend architecture pending.) ORM) must serialize data to match these interfaces exactly. Pay special attention to:
- Standardized date formatting (ISO 8601).
- Nested relationships (e.g., a `Sale` payload must include its `SaleItems`).


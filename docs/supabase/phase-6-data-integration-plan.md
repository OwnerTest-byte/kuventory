# Phase 6: Data Integration Plan

This document outlines the plan for migrating the Kuventory frontend from mock data / fake APIs to real Supabase database connections using `@supabase/supabase-js`.

## 1. Inventory & Supplies
- **Current Data Source**: `mockInventoryService` / REST API via `inventoryService.ts`
- **Target Supabase Table/RPC**: 
  - Tables: `stock_items`, `inventory_balances`, `inventory_locations`, `categories`, `units_of_measure`
  - RPC: `inventory_adjust`
- **Required Query**:
  - `getInventory()`: Select stock items joined with balances, categories, and units.
- **Required Mutation**:
  - `createItem()`: Insert into `stock_items`.
  - `updateItem()`: Update `stock_items`.
  - `adjustStock()`: Call RPC `inventory_adjust`.
- **Cache Invalidation**: `inventory`, `stock-movements` queries on change.
- **Status**: TO DO

## 2. Categories & Units
- **Current Data Source**: Hardcoded arrays or mock service.
- **Target Supabase Table/RPC**: `categories`, `units_of_measure`
- **Required Query**: `getCategories()`, `getUnits()`
- **Required Mutation**: `createCategory()`, `updateCategory()`, `archiveCategory()`
- **Status**: TO DO

## 3. Suppliers & Discounts
- **Current Data Source**: `mockSuppliersService`
- **Target Supabase Table/RPC**: `suppliers`, `supplier_discounts` (if separate, or fields on `suppliers`)
- **Required Query**: `getSuppliers()`
- **Required Mutation**: `createSupplier()`, `updateSupplier()`, `archiveSupplier()`
- **Status**: TO DO

## 4. Purchases
- **Current Data Source**: `purchasesService.ts`
- **Target Supabase Table/RPC**: 
  - Tables: `purchases`, `purchase_lines`
  - RPC: `create_purchase`, `receive_purchase`
- **Required Query**: `getPurchases()` with joined supplier and lines.
- **Required Mutation**: 
  - Create: call RPC `create_purchase`
  - Receive: call RPC `receive_purchase`
- **Status**: TO DO

## 5. Sales
- **Current Data Source**: `salesService.ts`
- **Target Supabase Table/RPC**: 
  - Tables: `sales`, `sale_lines`
  - RPC: `process_sale`
- **Required Query**: `getSales()`
- **Required Mutation**: Call RPC `process_sale`
- **Status**: TO DO

## 6. Expenses
- **Current Data Source**: `expensesService.ts`
- **Target Supabase Table/RPC**: 
  - Tables: `expenses`, `expense_categories`
  - RPC: `create_expense`
- **Required Query**: `getExpenses()`
- **Required Mutation**: Call RPC `create_expense`
- **Status**: TO DO

## 7. Cash Monitoring
- **Current Data Source**: Fake endpoints or mock data.
- **Target Supabase Table/RPC**: 
  - Tables: `cash_sessions`, `cash_transactions`
  - RPC: `open_cash_session`, `close_cash_session`
- **Required Query**: `getActiveSession()`, `getSessionHistory()`
- **Required Mutation**: Call `open_cash_session`, `close_cash_session`
- **Status**: TO DO

## 8. Stock Movements & Transfers
- **Current Data Source**: `mockInventoryService`
- **Target Supabase Table/RPC**: 
  - Tables: `stock_movements`
  - RPC: `create_stock_transfer`, `complete_stock_transfer`
- **Required Query**: `getMovements()`, `getTransfers()`
- **Required Mutation**: Call `create_stock_transfer`, `complete_stock_transfer`
- **Status**: TO DO

## 9. Dashboard
- **Current Data Source**: Fake dashboard metrics.
- **Target Supabase Table/RPC**: 
  - Aggregation queries over `sales`, `purchases`, `expenses`, `inventory_balances`.
- **Status**: TO DO

## 10. Reports
- **Current Data Source**: `mockReportsService.ts`
- **Target Supabase Table/RPC**: Various tables based on report type.
- **Status**: TO DO

## 11. Notifications
- **Current Data Source**: `mockNotificationService.ts`
- **Target Supabase Table/RPC**: `notifications` table.
- **Required Query**: Select notifications where `user_id = auth.uid()`
- **Required Mutation**: Update `is_read = true`
- **Status**: TO DO

## Common Implementation Details
- **Loading State**: All services will be integrated with TanStack Query. Components will handle `isLoading` using existing skeleton/spinner components.
- **Error State**: Handle `isError` gracefully with toast notifications (avoiding raw SQL leaks).
- **Empty State**: Fallback UI when arrays are empty.

# Feature Matrix

**Kuventory v2.0.0**

This matrix tracks the current implementation status of all major application features.

| Module | Feature | Status | Notes |
|---|---|---|---|
| **Core Layout** | Responsive Navigation | ✅ Completed | Sidebar, Navbar, Breadcrumbs |
| | Dark / Light Theme Toggle | ✅ Completed | Using `next-themes` |
| | Global Search | ✅ Completed | UI only, requires backend for full search. |
| **Dashboard** | Key Metrics Overview | ✅ Completed | Mock calculations. |
| | Sales vs Expenses Chart | ✅ Completed | Recharts implementation. |
| | Recent Activity Feed | ✅ Completed | Displays recent sales/expenses. |
| **Inventory** | Shift-based Calculations | ✅ Completed | Enforces Beginning/Added/AM/PM/Ending metrics. |
| | Auto-calculated Stocks | ✅ Completed | Total and Ending stock are derived automatically. |
| | Category Management | ✅ Completed | Raw material grouping. |
| | Low Stock Alerts | 🚧 Backend Required | UI badges implemented, needs backend cron. |
| **Sales** | Record Daily Sales | ✅ Completed | Form with dynamic item rows. |
| | Discount Processing | ✅ Completed | Calculates net amount after discounts. |
| | POS Integration | 📅 Future Version | Hardware integration not yet planned. |
| **Expenses** | Record Operational Expenses | ✅ Completed | Categorized expenses with receipts logic. |
| **Purchases** | Supplier Directory | ✅ Completed | Tracks supplier contact info. |
| | Purchase Orders | ✅ Completed | Links purchases to suppliers. |
| **Reports** | Data Grid View | ✅ Completed | Filtering and sorting implemented. |
| | PDF Export | ✅ Completed | Using `jspdf-autotable`. |
| | Excel Export | ✅ Completed | Using `xlsx`. |
| **Auth** | Role-based UI Guards | ✅ Completed | Hides links based on role. |
| | JWT Authentication | 🚧 Backend Required | Awaiting DRF integration. |
| **Database** | Data Persistence | 🚧 Backend Required | Currently running in-memory (Mock). |

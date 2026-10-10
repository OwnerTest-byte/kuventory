# [USER OPERATIONS MANUAL] KUVENTORY™ Operational Guide

**System Name:** KUVENTORY Enterprise Restaurant & Kiosk Inventory Management System  
**Document Code:** `DOC-01-UOM`  
**Classification:** Operational Guide · General Staff & Store Administrators  
**Production URL:** [https://kuventory.netlify.app](https://kuventory.netlify.app)  
**Version:** 2.4.0 (Production Release)  
**Companion Word Document:** [`KUVENTORY_USER_GUIDE.docx`](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/KUVENTORY_USER_GUIDE.docx)

---

## Executive Summary & Quick Start

KUVENTORY is a specialized, real-time inventory management system designed for food and beverage dining concepts like Kape Uno Bistro. It digitizes daily physical stock taking, shift reconciliations, stock intake, automated FEFO (First-Expired, First-Out) rotation, and daily snapshot audit reports.

### Role Hierarchy & Login Quick Reference

| Role Tier | Typical Title | System Role | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Level 2** | Barista / Kitchen Staff / Shift Operator | `USER` / `STAFF` | Daily inventory count entries (Beg, Add, AM, PM), viewing batches, viewing item status. |
| **Level 1** | Store Manager / Kitchen Supervisor | `ADMIN` | Catalog management, receiving batches, stock corrections, finalizing daily inventory sheets, generating reports, managing staff accounts. |
| **Tier 0** | System Owner / Technical Director | `MASTER_ADMIN` | Absolute system governance, real-time telemetry, 1-click database snapshots, disaster recovery restoration, emergency maintenance lockdown. |

---

## 1. Getting Started & Navigation

### 1.1 Logging In
1. Navigate to [https://kuventory.netlify.app](https://kuventory.netlify.app) on any smartphone, tablet, or desktop browser.
2. Enter your assigned Work Email and Password.
3. Click **Sign In**. The system will authenticate your session via Supabase JWT and direct you to the operational Dashboard.
4. **Single-Session Security:** KUVENTORY enforces enterprise session exclusivity. If an account is logged in elsewhere, a clear alert is displayed. Closing your browser tab or window automatically releases your session lease via an asynchronous browser `keepalive` beacon. Quitting the browser automatically terminates active session state for defense-in-depth protection.
5. **Forgot Password:** Click "Forgot password?" to instantly dispatch an urgent reset notification to the Master Administrator hotline (**09917101298** / `master@kuventory.com`).

### 1.2 User Interface Layout
- **Left Navigation Rail (Desktop):** Gives immediate access to Dashboard, Daily Inventory, Items Catalog, FEFO Batches, History, Reports, and Notifications.
- **Top Header:** Displays the current active business date, connection status, theme toggle (Light / Dark mode), and current profile. Static bell icons have been removed in favor of direct pop-ups.
- **Real-Time Notification Pop-Up:** Live notifications appear as interactive floating pop-up cards at the top-right. Clicking a card instantly navigates directly to the referenced entity (e.g., low-stock item or batch).
- **Mobile Navigation Drawer & Bottom Bar:** On mobile screens (< 768px), an ergonomic bottom bar and slide-out drawer provide quick one-thumb navigation.

---

## 2. Daily Inventory Shift Routine (Step-by-Step)

The **Daily Inventory Worksheet** (`/daily-inventory`) is the operational heart of KUVENTORY. It replaces paper clipboards with a synchronized digital sheet.

```
[Start of Shift: Record BEG] ──► [Mid-Day: Record ADD & AM OUT] ──► [End of Shift: Record PM OUT] ──► [Supervisor: Finalize Sheet]
```

### 2.1 The Daily Stock Formula
All calculations in KUVENTORY are computed automatically at the database engine level to guarantee mathematical integrity:

$$\text{TOTAL} = \text{BEGINNING} + \text{ADD}$$
$$\text{ENDING} = \text{TOTAL} - \text{AM OUT} - \text{PM OUT}$$

### 2.2 Step-by-Step Shift Tasks
1. **Morning Opening (Opening Staff):**
   - Open **Daily Inventory** from the sidebar.
   - Verify the **Beginning (BEG)** stock column. For continuing days, this defaults automatically from the prior finalized day's Ending balance.
   - Inspect any incoming morning supplier deliveries and input them directly into the **ADD** column.
2. **Mid-Day Shift Handover (AM Shift):**
   - Input units consumed or sold during the morning rush into **AM OUT**.
   - Review the auto-calculated remaining total.
3. **Closing Count & Verification (PM Shift):**
   - Input units consumed or sold during the evening rush into **PM OUT**.
   - The system automatically displays the final computed **ENDING** stock balance.
4. **Finalizing the Day (Store Admin Only):**
   - The Store Admin reviews the variances and numbers.
   - Click **Finalize Inventory**.
   - The system validates the numbers, executes automatic FEFO batch depletion in PostgreSQL, creates an immutable report snapshot, and locks the sheet against accidental tampering.

---

## 3. Items Catalog & Inventory Management

### 3.1 Viewing Items
Navigate to **Inventory** (`/inventory`) to see the comprehensive catalog.
- **Category Tabs:** Filter stock instantly by Beverage, Food, Packaging, Cleaning Supplies, or custom categories.
- **Status Badges:**
  - `In Stock`: Sufficient quantity above the threshold.
  - `Low Stock`: Quantity at or below the safety reorder point (`min_quantity`).
  - `Expiring Soon`: Lots nearing expiration within 7 days.
  - `Out of Stock`: Quantity is 0.

### 3.2 Adding a New Item (Admins Only)
1. In the Inventory screen, click **+ Add New Item**.
2. Fill in:
   - **Item Name** (e.g., "Whole Bean Arabica 1kg")
   - **Category** (e.g., "Beverages / Coffee")
   - **Unit of Measure** (e.g., "kg", "pcs", "cans", "boxes")
   - **Minimum Reorder Quantity** (safety stock alert trigger)
   - **Cost per Unit** (for inventory valuation)
3. Click **Save Item**. The item is immediately available across all sheets.

### 3.3 Adding Stock / Receiving Deliveries
1. Locate the item in the Inventory table.
2. Click **Add Stock**.
3. Enter the received quantity, supplier invoice number, batch lot number, and expiration date.
4. Click **Confirm Receipt**. A new FEFO batch is logged in `stock_batches`, and a ledger entry is appended to `stock_movements`.

---

## 4. FEFO Expiration & Batch Rotation

KUVENTORY enforces **First-Expired, First-Out (FEFO)** to prevent food spoilage and eliminate stock obsolescence:

1. **Automatic Consumption Queue:** When stock is consumed through daily inventory finalization or manual deductions, KUVENTORY automatically deducts units from the oldest active batch first.
2. **Zero-Stock Expiration Rule:** Once a batch reaches `quantity_remaining = 0`, it is automatically removed from active expiring displays while remaining preserved in historical ledgers for audit tracking.
3. **Batch Expiration Warnings:**
   - **Amber Badge (`Expiring Soon`):** Batch expires within 7 days.
   - **Red Badge (`Expired`):** Batch has passed its expiry date.

---

## 5. Reports Library & Audit Exports

Navigate to **Reports** (`/reports`) to access finalized daily summaries and historical logs:

### 5.1 Immutable Report Snapshots
Every finalized daily inventory creates an immutable snapshot in `public.reports` and `public.report_items`. Even if inventory balances fluctuate in the future, past finalized reports remain permanent and mathematically locked.

### 5.2 Exporting Reports
1. Select the desired date or date range.
2. Click **Export Report**:
   - **PDF Export (`.pdf`):** Generates an official, print-ready document with company header, category groupings, beginning/ending balances, and sign-off blocks.
   - **Excel Export (`.xlsx`):** Downloads a formatted spreadsheet ready for accounting software or food cost analysis.
   - **CSV Export (`.csv`):** Raw tabular data for spreadsheet import.

---

## 6. Real-Time Notification Center

Click the **Notification Bell** in the top navigation or visit `/notifications`:
- **Low Stock Alerts:** Dispatched immediately when an item's balance breaches its reorder point.
- **Expiry Warnings:** Dispatched when active batches enter the 7-day expiration window.
- **Stock Discrepancy Alerts:** Triggered if an unexpected adjustment is logged.
- **Mark as Read / Clear All:** Allows staff to acknowledge alerts while keeping the central audit log intact.

---

## 7. Responsive Mobile & Tablet Operation

KUVENTORY is engineered for mobile operational environments:
- **PWA Installation:** Tap **Share** $\rightarrow$ **Add to Home Screen** on Safari (iOS) or Chrome (Android) to run KUVENTORY full-screen without browser address bars.
- **Vertical Scroll Preservation:** All modals, login screens, and tables are vertically scrollable with thumb-friendly touch targets ($\ge 44\text{px}$).
- **Offline Resilience:** If network connection temporarily drops on the kitchen floor, local inputs remain cached until reconnecting.

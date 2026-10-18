# KUVENTORY™ USER GUIDE & OPERATING MANUAL

**Commercial Restaurant & Kiosk Inventory Management System**  
*Daily Inventory Recording • FEFO Stock Management • Automated Snapshot Reports*

---

## Document Summary

- **Production URL:** [https://kuventory.netlify.app](https://kuventory.netlify.app)
- **Version:** Version 2.6.0 (Production Release)
- **Word Document File:** [`KUVENTORY_USER_GUIDE.docx`](./KUVENTORY_USER_GUIDE.docx)
- **Target Audience:** All System Users (**Staff**, **Administrators**, and **Super Admins**)

---

## Table of Contents

1. [System Purpose & User Roles](#1-system-purpose--user-roles)
2. [Getting Started, Navigation & Secure Logout](#2-getting-started-navigation--secure-logout)
3. [Daily Inventory Worksheet & Shift Routine](#3-daily-inventory-worksheet)
   - 3.1 Core Mathematical Formulas
   - 3.2 Shift Count & Finalization Workflow
   - 3.3 Correcting a Finalized Day (Audited Revisions & Differential FEFO)
4. [Managing Stations & Custom Category Tables](#4-managing-stations--custom-category-tables)
5. [Inventory Items Catalog](#5-inventory-items-catalog)
6. [Stock Management & FEFO Batches (Add, Deduct, Adjust)](#6-stock-management--fefo-batches)
7. [Reports Library, Historical Snapshots & Data Exports](#7-reports-library--data-exports)
8. [Real-Time Notification Center](#8-real-time-notification-center)
9. [Administration, Password Recovery Log & Settings](#9-administration--settings-admins-only)
   - 9.1 Staff & User Management
   - 9.2 Password Reset Requests Log (Admin & Super Admin)
   - 9.3 Establishment Profile & Branding
   - 9.4 Notification Settings & Thresholds
10. [Standalone Super Admin Control Plane & Emergency Lockdown](#10-standalone-super-admin-control-plane--emergency-lockdown)
11. [Troubleshooting & Common Operational Solutions](#11-troubleshooting--common-operational-solutions)

---

## 1. System Purpose & User Roles

KUVENTORY is a specialized, practical inventory management system engineered to digitize daily stock recording, shift reconciliations, stock intake/deductions, FEFO batch tracking, and audit report generation. It focuses purely on efficient inventory control without unnecessary ERP or accounting bloat.

### User Roles in KUVENTORY

KUVENTORY provides three distinct user roles with database- and route-enforced permissions:

| User Role | Primary Responsibilities | System Permissions |
| :--- | :--- | :--- |
| **User (Staff)** | Daily operational inventory recording, shift count verification, sales deductions, stock additions, audited finalized sheet corrections, and reading notifications. | Access to Dashboard, Daily Inventory Worksheet (draft and audited finalized correction modes), Items Catalog, Batches (FEFO), Movement History, Reports Library, and Notification Center. |
| **Admin (Manager)** | Operational management, staff account creation, category/station management, finalized report corrections, password reset request review, and restaurant profile. | Full staff capabilities **PLUS** User Management, Password Reset Requests log, Categories configuration, System Settings, and Profile controls. |
| **Super Admin** | Autonomous infrastructure oversight, database operations, emergency lockdown enforcement, system-wide recovery, and disaster prevention. | Dedicated standalone access to `/super-admin`, authoritative Emergency Maintenance Lockdown (`NORMAL`, `MAINTENANCE`, `RECOVERY`), migration tracking, and platform health. |

> [!IMPORTANT]
> **Role Distinction & Standalone Control Plane:** Both Staff and Admins can record daily counts and execute audited corrections on finalized sheets with a required change rationale. Admins have exclusive access to staff user management and password reset logs. Super Admin operates outside ordinary Settings via a secure, standalone control plane.

---

## 2. Getting Started, Navigation & Secure Logout

### 2.1 Logging In to KUVENTORY

1. **Access the Web Application:** Open any modern web browser (Google Chrome, Safari, Edge, Firefox) on your smartphone, tablet, or PC and go to: `https://kuventory.netlify.app`
2. **Enter Credentials:** Type your registered Work Email and Password in the login fields.
3. **Sign In:** Click the **Sign In to KUVENTORY** button. You will be taken directly to the main Dashboard.
4. **Forgot Password:** If you forgot your password, click **Forgot password?** below the password input. Enter your email and click **Dispatch to Super Admin**. Your request is logged immediately in the administrator audit log with an opaque, non-disclosing confirmation message for maximum account security.

### 2.2 Secure Logout with Confirmation

KUVENTORY protects against accidental logouts and unsaved work:
- Whenever you click **Logout** (from the sidebar, top header, or mobile navigation), a confirmation modal appears:
  - **Prompt:** `"Log out? Are you sure you want to log out?"`
  - **Cancel:** Dismisses the dialog and keeps your current session, worksheets, and state completely intact.
  - **Log Out:** Securely terminates your active session, invalidates the database lease token, clears sensitive caches, and redirects to the login screen.
- **Unsaved Work Alert:** If you have pending edits on the Daily Inventory sheet, an amber warning notifies you before logging out.
- **Emergency Lockdown Exception:** In the event of a security-enforced session revocation or backend emergency lockdown, access is terminated immediately without waiting for a confirmation dialog.

> [!TIP]
> **Install as an App (PWA):** On mobile or tablet, tap your browser's menu (or share button) and select **Add to Home Screen** to install KUVENTORY as a high-speed Progressive Web App that opens like a native app.

### 2.2 Global Navigation & Command Palette

You can navigate KUVENTORY using the sidebar navigation (on desktop/tablet) or the bottom navigation bar (on mobile phones):

- **Dashboard:** High-level overview of total inventory value, items count, low-stock alerts, and quick actions.
- **Daily Inventory:** The core daily worksheet matching your physical paper count sheets.
- **Items Catalog:** Full directory of all inventory items, batches, movement history, and categories.
- **Reports:** Historical daily snapshot sheets, stock valuation, and stock movement logs.
- **Notifications:** Real-time bell icon with alerts for low stock and expiring items.
- **Settings:** Profile, password management, and (for Admins) user management & system settings.

> [!TIP]
> **Instant Search with Command Palette:** Press `Ctrl + K` (or `Cmd + K` on iPad/Mac) anywhere in the application to summon the Command Palette. Type any item name, category, or page to jump straight to it in one keystroke.

---

## 3. Daily Inventory Worksheet

The Daily Inventory Worksheet is designed to match the natural layout of a physical paper inventory sheet. It organizes items into dynamic category-driven stations (e.g., Grilled Stock, Portion Stock, Per Cases, Beverages, Snacks).

### 3.1 The 4 Core Mathematical Formulas

KUVENTORY automatically calculates balances in real time so staff never have to perform manual mental math:

| Column | Formula & Rule | Explanation |
| :--- | :--- | :--- |
| **BEG (Beginning)** | Carried from previous day's ending stock | The unopened/available quantity on shelves at the start of the day. |
| **ADD (Stock In)** | Direct entry or via Add Stock modal | Any new deliveries or restocks received during the day. |
| **TOTAL (Total Stock)** | `TOTAL = BEG + ADD` | The total available stock available for sale or preparation today. |
| **SALES AM & PM** | Entered during or after morning/evening shifts | Total units consumed, sold, or dispensed during each shift. |
| **ENDING (Expected)** | `ENDING = TOTAL - SALES AM - SALES PM` | The expected remaining physical units that should be on the shelf. |
| **DISCREPANCY** | `DISCREPANCY = Physical Count - ENDING` | Variance between what is physically counted and what the system expects. |

### 3.2 Step-by-Step Daily Inventory Shift Workflow

1. **Select Date:** Open **Daily Inventory**. Use the date selector at the top to choose today's date (defaults to current date).
2. **Check Beginning Quantities (BEG):** Verify that the **BEG** column reflects the stock on hand at store opening. If starting a new session, KUVENTORY carries over the finalized ending quantities from the previous day.
3. **Record Incoming Stock (ADD):** When a supplier delivery or stock transfer arrives, click the `+` icon beside the item in the ADD column or type the quantity directly. The Total Stock column immediately updates.
4. **Enter Morning Deductions (SALES AM):** At the end of the morning rush (around 12:00 PM – 1:00 PM), enter the units consumed into the **SALES AM** column.
5. **Enter Afternoon/Evening Deductions (SALES PM):** At the end of the evening rush (around 8:00 PM – 9:00 PM), enter the units consumed into the **SALES PM** column.
6. **Perform Closing Physical Count:** Count the physical items remaining on shelves and compare with the auto-calculated **ENDING** column. If Ending is negative, it will highlight in red indicating that more units were deducted than were in Total Stock.
7. **Finalize the Shift Worksheet:** Once all counts are verified, click **Finalize Daily Inventory** at the top right. Confirming this action locks the worksheet into an immutable Daily Report Snapshot for accounting.

> [!IMPORTANT]
> **Automatic Real-Time Autosave:** As you type numbers in the worksheet, KUVENTORY automatically saves changes after a 350ms pause. You will see the indicator change to **Saved** with a green checkmark. Your draft is protected even if the page is accidentally closed.

### 3.3 Correcting a Finalized Day (Audited Revisions & Differential FEFO)

When an audit error, missed delivery, or typo is discovered on an already-finalized daily sheet, authorized users (**Staff**, **Admins**, and **Super Admins**) can execute an audited correction without losing historical data:

1. **Open the Finalized Sheet:** Navigate to Daily Inventory and select the finalized date, or click **Correct Finalized Day** from the Dashboard or Reports listing.
2. **Click "Correct Finalized Day":** A high-visibility button appears in the top action bar when viewing any finalized sheet.
3. **Audit Confirmation & Rationale Prompt:** A modal prompts for an **Audit Reason** (e.g., *"Late evening delivery of 10 cases missed before closing count"*). Entering a clear rationale is mandatory for compliance.
4. **Active Correction Mode:** An amber status banner indicates that you are in active correction mode. The input fields for beginning quantities, additions, and sales deductions become editable.
5. **Differential FEFO Stock Reconciliation (Zero Duplicate Movements):**
   - When you click **Save Correction**, KUVENTORY calculates the *exact delta* between the previously finalized count and your corrected values.
   - Authoritative catalog inventory and active FEFO batches are reconciled using atomic differential adjustments.
   - **Crucial Safety Guarantee:** Prior stock transactions are never blindly re-executed. Deliveries are never added twice, and previous sales deductions are never subtracted twice.
6. **Immutable Revision Trail:**
   - The original finalized report snapshot is permanently retained as **Revision 1**.
   - A new immutable snapshot is generated as **Revision 2** (or subsequent revision number), tagging the author, timestamp, and audit reason.
7. **Inspect Prior Revisions:** Click the **Revision History** button at any time to view a side-by-side modal displaying all past revisions, who corrected them, when, and the specific reason provided.

---

## 4. Managing Stations & Custom Category Tables

In KUVENTORY, the Daily Inventory Worksheet is divided into distinct category-driven station tables (such as Grilled Stock, Portion Stock, Per Cases, Beverages, Snacks, or custom stations).

### 4.1 Creating a New Station / Category Table

1. **Click "+ Add Station":** At the top of the Daily Inventory page, click the `+ Add Station` button.
2. **Enter Station Name:** Type the name for your new station (for example: `FROZEN GOODS`, `DESSERTS`, or `CLEANING SUPPLIES`).
3. **Confirm Creation:** Click **Create Station**. A new station table immediately appears in your daily worksheet with its own quick-jump tab and icon.

### 4.2 Adding an Item Directly to a Station

1. **Locate the Station Header:** Find the station table where you want the new item to belong.
2. **Click "+ Add Item":** Click the small `+ Add Item` button located right inside the station header bar.
3. **Complete Item Details:** The item creation modal will open with the station category pre-selected. Enter the Item Code, Name, Unit, and Initial Stock, then click **Create Item**. The item immediately appears in that station table ready for daily counting.

---

## 5. Inventory Items Catalog

The Items Catalog (`/items`) is your master database of all products, ingredients, packaging, and raw materials.

### 5.1 Catalog Tabs Overview

- **Items Catalog:** Grid and list view of all active inventory items with search, filters, and quick stock updates.
- **Stock Batches (FEFO):** Overview of all active batches sorted by expiration date to prevent spoilage.
- **Movement History:** Complete chronological transaction log of every addition, deduction, and adjustment.
- **Categories:** Manage categories and station assignments.
- **Suppliers:** Directory of registered suppliers.

### 5.2 Adding a New Item to the Catalog

1. **Open Add Modal:** Navigate to **Items Catalog** and click the `+ Add Item` button at the top right.
2. **Fill Required Fields:** Provide: Item Code (SKU or barcode), Item Name, Category (Station), and Unit of Measure (pcs, packs, cans, bottles, kg, L).
3. **Set Cost & Safety Threshold:** Enter the Unit Cost (in PHP) and Minimum Quantity (Min Threshold). If stock drops to or below this number, the system automatically triggers a Low Stock notification.
4. **Suppliers & Initial Stock (Optional):** Optionally select primary (Supplier A) and secondary (Supplier B) vendors and enter an Initial Stock quantity to seed opening inventory immediately.
5. **Save Item:** Click **Create Item**. The item is now tracked across the catalog and daily worksheets.

### 5.3 Editing & Archiving Items

- **Editing:** Click the pencil (**Edit**) icon on any item row to modify prices, descriptions, units, or safety thresholds.
- **Archiving:** Click the **Archive** icon on obsolete or discontinued items. Archived items are hidden from daily inventory but their historical transaction records remain intact.
- **Filter Active vs Archived:** Use the status filter dropdown at the top of the catalog to toggle between Active and Archived items.

---

## 6. Stock Management & FEFO Batches

KUVENTORY handles stock changes using Atomic Transactions to guarantee 100% balance integrity without race conditions or lost updates.

### 6.1 Updating Stock via the Stock Modal

On any item card or catalog row, click **Update Stock** (or click the plus/minus icon) to open the Stock Management modal. Choose one of three actions:

| Action | When to Use | Required Inputs | Resulting System Effect |
| :--- | :--- | :--- | :--- |
| **ADD (+)** | When receiving new shipments, supplier restocks, or transferred goods. | Quantity received, Expiry Date (optional for perishables), and Reason. | Increases current stock balance, creates a new batch with expiration date for FEFO tracking, and records an ADD transaction. |
| **REMOVE (-)** | When recording ingredient consumption, damaged items, or food waste. | Quantity to remove, Batch selection (Auto-FEFO or specific batch), and Reason. | Decreases current stock balance, deducts from the earliest expiring batch first, and records a REMOVE transaction. |
| **ADJUST (=)** | During formal weekly audits or physical recount corrections. | Actual physical counted quantity and Reason (e.g., Weekly Audit Reconciliation). | Overrides current stock balance with the physical count and logs an ADJUST transaction showing previous vs new balance. |

### 6.2 How FEFO (First Expire, First Out) Works

FEFO ensures that older and near-expiry stock is prioritized before fresher stock is opened:

1. **Batch Creation:** Whenever stock is added with an Expiry Date, KUVENTORY generates a distinct batch (e.g., `BATCH-A1B2C3`).
2. **Automatic Deduction Queue:** When `REMOVE` is selected with `Auto-FEFO`, the system automatically consumes units from the batch with the earliest expiration date.
3. **Expiration Status Badges:** In the Batches view, items are color-coded:
   - **Green Badge:** Safe / In Stock (> 30 days remaining)
   - **Amber Badge:** Expiring Soon (within 30 days)
   - **Red Badge:** Expired (past expiry date — flagged for immediate quarantine).

---

## 7. Reports Library & Data Exports

The Reports Library (`/reports`) provides centralized visibility into daily operations, financial inventory valuation, and historical audit logs.

### 7.1 Report Types

- **Daily Inventory Sheets:** Master list of all finalized daily worksheets. Clicking any report opens its full breakdown with itemized beginning, added, AM/PM usage, and ending totals.
- **Live Stock & Valuation:** Instant real-time financial report showing total units on hand, unit acquisition costs, and total inventory value in PHP grouped by category.
- **Stock Movement History:** Comprehensive audit trail of every stock addition, deduction, and recount adjustment with user timestamps.
- **Alerts (Low Stock & Expiry):** Filterable lists of items that need immediate reordering or perishable batches near their expiration date.

### 7.2 Exporting Reports (PDF, Excel XLSX, CSV)

When viewing any Daily Report snapshot (`/reports/:id`), use the action buttons in the top toolbar:

- **Export to PDF:** Downloads a clean, professional, high-contrast PDF document formatted for standard letter/A4 printing or POS receipt thermal printers.
- **Export to Excel (.xlsx):** Downloads a formatted Microsoft Excel spreadsheet with structured columns, headers, and formulas for bookkeeping.
- **Export to CSV:** Downloads a comma-separated values file suitable for importing into external business tools.
- **Print:** Instantly opens the browser system print dialog for immediate physical printing.

> [!IMPORTANT]
> **Immutable Snapshots:** Finalized reports are saved as permanent snapshots. Editing active catalog item names or prices later will **never** alter past historical reports.

---

## 8. Real-Time Notification Center

The Notification Center (`/notifications`) alerts users to critical inventory events without needing to search through tables:

| Notification Type | Trigger Condition | Color Badge | Recommended Staff Action |
| :--- | :--- | :--- | :--- |
| **LOW STOCK** | Current stock is at or below the item's Minimum Threshold. | Amber Badge | Place restock order with primary supplier (Supplier A). |
| **OUT OF STOCK** | Current stock reaches 0 units. | Red Badge | Inform kitchen/bar staff immediately and initiate emergency replenishment. |
| **EXPIRING SOON** | A stock batch is within the warning threshold (e.g. 7-14 days). | Amber Badge | Prioritize using this batch for today's food preparation. |
| **EXPIRED** | A stock batch has passed its Best-Before expiration date. | Red Badge | Quarantine batch immediately and record under Remove -> Expired. |

- **Mark as Read:** Click the checkmark icon on any notification to acknowledge it.
- **Mark All as Read:** Click **Mark All Read** at the top right to clear all unread badges at once.

---

## 9. Administration, Password Recovery Log & Settings (Admins Only)

The Settings area (`/settings`) allows system personalization, user account provisioning, and recovery auditing.

### 9.1 Staff & User Management (Admin Only)

1. **View Active Users:** Navigate to Settings -> **Staff & Users**. You will see all registered accounts, their display names, and their roles (`ADMIN` or `USER`).
2. **Create New Staff Account:** Click `+ Add New Staff`. Enter their Email, Display Name, Temporary Password, and select their Role (User or Admin).
3. **Change User Roles:** Use the role selector to switch an existing staff member between `USER` and `ADMIN`.
4. **Reset Staff Password:** If a staff member forgets their password, click `Reset Password` beside their name and input a new secure password for them.

### 9.2 Password Reset Requests Log (Admin & Super Admin)

Under Settings -> **Staff & Users** -> **Password Reset Requests**, administrators can inspect inbound account recovery attempts:
- **Captured Fields:** Request ID, User Email (normalized), Request Timestamp, Current Status, and Action.
- **Supported Statuses:** `NEW`, `NOTIFIED`, `IN REVIEW`, `RESOLVED`, `EXPIRED`, `FAILED`.
- **Reviewing a Request:** Administrators can click **Review / Resolve** to mark a request resolved after contacting the employee or generating a controlled credential.
- **Security Protections:** Passwords, reset tokens, and raw recovery URLs are *never* stored in database logs. Requesters always receive an identical opaque message preventing user enumeration.

### 9.3 Establishment Profile (Admin Only)

Under Settings -> **Establishment**, Admins can update the store name, contact phone number, address, and upload an official business logo. This branding automatically appears on generated PDF and Excel reports.

### 9.4 Notification Settings & Thresholds (Admin Only)

Admins can customize system-wide alert triggers:
- **Low Stock Alert:** Enable/disable system-wide low stock banners.
- **Batch Expiration Notice:** Configure how many days in advance the system warns staff before a batch expires (default: 7 days).

---

## 10. Standalone Super Admin Control Plane & Emergency Lockdown

Super Admin is maintained as an isolated, standalone administrative plane (`/super-admin`), completely outside the ordinary Settings menu.

### 10.1 Access & Authorization

- **Direct Route:** `/super-admin` guarded by the database-enforced `RequireSuperAdmin` role check.
- **Unauthorized Handling:** Users with role `USER` or `ADMIN` attempting to access `/super-admin` are immediately blocked with a 403 Forbidden alert and redirected to `/`.

### 10.2 Emergency Maintenance Lockdown

Super Admins can place the entire application into an authoritative maintenance lockdown:
- **Supported States:**
  - `NORMAL`: All store operations, logins, and API mutations function normally.
  - `MAINTENANCE`: The entire application locks. Non-super users are prevented from logging in, navigating protected screens, or submitting stock mutations. Active sessions immediately render an Emergency Lockdown screen.
  - `RECOVERY`: Read-only audit mode for database restorations and data consistency verifications.
- **Backend & Database Enforcement:** Enforcement is built into database triggers, RLS policies, and API routing. Users cannot bypass the lockdown screen through API calls or developer tools.
- **Ending Lockdown:** Only an authorized Super Admin can deactivate the lockdown by selecting `NORMAL` and verifying system health.

---

## 11. Troubleshooting & Common Operational Solutions

| Operational Scenario | Likely Cause | Corrective Action Steps |
| :--- | :--- | :--- |
| **Ending Stock displays negative (highlighted in red)** | More units were entered under SALES AM or SALES PM than existed in Total Stock (`BEG + ADD`). | 1. Verify if incoming deliveries were received but not recorded in the ADD column.<br>2. Recount physical shelf items.<br>3. Check if sales entries were mistyped (e.g. typed 20 instead of 2). |
| **Worksheet is locked and shows "Finalized"** | The daily worksheet has already been Finalized for this date. | Authorized Admins and Super Admins can click **Correct Finalized Day** at the top right, enter a required audit reason, make the necessary corrections, and save a new tracked revision. |
| **Clicking Logout opens a confirmation modal** | Intentional security feature to prevent accidental session termination and loss of work. | Click **Log Out** to confirm exit, or click **Cancel** to continue working on your sheet. |
| **Emergency Maintenance screen appears** | Super Admin has placed the platform into an authoritative maintenance lockdown. | Floor operations are temporarily halted for database maintenance or safety updates. Wait for management notification once the system returns to Normal status. |
| **Internet connection drops during shift count** | Kiosk Wi-Fi fluctuation. | **Do NOT** refresh or close the browser tab. KUVENTORY caches entries locally. As soon as connectivity returns, changes automatically sync with the cloud. |
| **Staff member cannot access Admin or Super Admin tabs** | Account is assigned the `USER` role. | User accounts have restricted permissions for security. Contact an Admin or Super Admin to upgrade your role if management access is required. |
| **Batch expired notification is showing** | Stock batch passed its recorded expiry date. | Inspect the physical stock. If expired, remove from service shelves, open **Update Stock**, select **Remove**, choose **Expired inventory**, and deduct the quantity. |

---

*Authored by KUVENTORY Development & Quality Assurance Team.*  
*Official Reference Guide for KUVENTORY Inventory Operations.*

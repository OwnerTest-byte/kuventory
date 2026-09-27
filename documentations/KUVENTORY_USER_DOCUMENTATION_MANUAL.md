# KUVENTORY™ ENTERPRISE USER MANUAL

## Standard Operating Procedures (SOP) & Operational User Guide

**Commercial Inventory & FEFO Management Platform for Kape Uno Bistro**

---

### Document Information & Metadata

- **System URL:** [https://kuventory.netlify.app](https://kuventory.netlify.app)
- **Document Reference:** `KUV-SOP-MANUAL-2026-V2.4`
- **Revision:** Version 2.4.0 (Stable Enterprise Release)
- **Effective Date:** September 2026
- **Word Document File:** [`KUVENTORY_USER_DOCUMENTATION_MANUAL.docx`](./KUVENTORY_USER_DOCUMENTATION_MANUAL.docx)
- **Target Audience:** Store Crew, Baristas, Bodega Custodians, Shift Supervisors, and Branch Operations Managers

---

## Document Control & Governance

### Revision History
| Version | Release Date | Author / Role | Summary of Operational Changes |
| :--- | :--- | :--- | :--- |
| **1.0.0** | Jan 2026 | Lead Architect | Initial launch: Master item catalog, single-count daily shift logs. |
| **2.0.0** | May 2026 | Systems Team | Engine upgrade: FEFO batch expiration tracking, barcode scanning, Supabase cloud sync. |
| **2.3.0** | Aug 2026 | Full-Stack Team | Category/Station dynamic unification, responsive mobile card view, debounced autosave. |
| **2.4.0** | Sep 2026 | QA & Operations | Comprehensive SOP User Manual authored per TechSmith User Documentation Standards. |

---

## Table of Contents
1. [Analysis of TechSmith User Documentation Framework](#1-analysis-of-techsmith-user-documentation-framework)
2. [User Personas & Role-Based Access Control (RBAC)](#2-user-personas--role-based-access-control-rbac)
3. [5-Minute Quick-Start Guide](#3-5-minute-quick-start-guide)
4. [Standard Operating Procedures (SOPs)](#4-standard-operating-procedures-sops)
   - [SOP-01: Shift Opening & Initial Count Verification](#sop-01-shift-opening--initial-count-verification)
   - [SOP-02: Receiving Goods & FEFO Batch Tagging (Stock-In)](#sop-02-receiving-goods--fefo-batch-tagging-stock-in)
   - [SOP-03: Real-Time Shift Deductions (AM & PM Service)](#sop-03-real-time-shift-deductions-am--pm-service)
   - [SOP-04: Spoilage, Damage & Waste Disposal Logging](#sop-04-spoilage-damage-and-waste-disposal-logging)
   - [SOP-05: Shift Closing Physical Count & Discrepancy Reconciliation](#sop-05-shift-closing-physical-count--discrepancy-reconciliation)
5. [Detailed Functional Module Guides](#5-detailed-functional-module-guides)
   - [5.1 Master Catalog & Category/Station Management](#51-master-catalog--categorystation-management)
   - [5.2 Daily Inventory Shift Worksheet](#52-daily-inventory-shift-worksheet)
   - [5.3 Stock-In & FEFO Expiration Management](#53-stock-in--fefo-expiration-management)
   - [5.4 Inventory Snapshots & Audit Reports](#54-inventory-snapshots--audit-reports)
6. [Mathematical Equilibrium Formula & Data Dictionary](#6-mathematical-equilibrium-formula--data-dictionary)
7. [Troubleshooting & Edge-Case Playbook](#7-troubleshooting--edge-case-playbook)
8. [Hardware Hygiene & Best Practices](#8-hardware-hygiene--best-practices)
9. [Glossary of Commercial Terms](#9-glossary-of-commercial-terms)

---

## 1. Analysis of TechSmith User Documentation Framework

Based on the industry standards defined in TechSmith's comprehensive user documentation guide ([TechSmith User Documentation Guide](https://www.techsmith.com/blog/user-documentation/)), high-performing user documentation bridges the gap between software engineering and everyday human tasks.

### 1.1 Definition & Nature of a Commercial User Manual
TechSmith emphasizes that a user manual is **not a novel or a technical design document**. Users do not read manuals chronologically from start to finish. Instead, they consult them under time pressure when trying to execute a task or diagnose a roadblock. 
To serve this purpose, documentation requires three critical structural anchors:
1. **Navigational Anchor:** Clear hierarchical Table of Contents and modular numbered headers so users find answers within 10 seconds.
2. **Operational Anchor:** A concise 5-Minute Quick-Start Guide enabling incoming staff to operate the terminal without reading dozens of pages.
3. **Diagnostic Anchor:** A concrete Troubleshooting and Edge-Case Matrix with explicit symptoms, causes, and action steps.

### 1.2 The Seven Standard Manual Types Applied to KUVENTORY
| Manual Type | TechSmith Core Purpose | KUVENTORY Implementation |
| :--- | :--- | :--- |
| **Instruction Manual** | Teaches how to perform specific individual tasks. | Daily Worksheet entry, entering AM/PM usage, toggling mobile card view. |
| **Training Manual** | Structured learning curriculum for onboarding. | 5-Minute new hire onboarding flow for baristas and kitchen crew. |
| **Service Manual** | Technical maintenance, repairs, and diagnostics. | Supabase real-time connectivity status, offline cache reset, PWA storage. |
| **Operation Manual** | Instructions for day-to-day continuous operations. | Morning opening stock audit, shift handover counts, closing reconciliations. |
| **Organizational Policy** | Outlines high-level business rules and compliance. | FEFO mandatory rotation policy, damage photo requirements for losses > 200 PHP. |
| **SOP Manual** | Rigid, step-by-step compliant operating procedures. | SOPs 01 through 05 covering intake, deductions, waste, and discrepancy audits. |
| **Quick Reference Guide** | High-density cheat sheet of shortcuts and keys. | Command Palette (`Ctrl+K`) hotkey guide and inventory balance formula card. |

### 1.3 The 8 Essential Elements of a Great Manual
1. **Plain Language:** Avoid technical jargon (e.g., "PostgreSQL RPC lock", "WebSocket reconnect") in favor of everyday operational terms ("Saved shift count", "Batch expiration date").
2. **Simplicity:** Keep procedural steps bite-sized with one clear action per sentence.
3. **Visuals & Field Dictionaries:** Provide exact field labels, status badge colors, and data types so users know what to type and what each color signifies.
4. **Problem-Solving Focus:** Organize tasks around user dilemmas ("What to do when physical stock doesn't match", "How to log a spilled syrup bottle").
5. **Logical Hierarchy & Flow:** Match the chronological journey of a restaurant shift: Morning -> Afternoon Intake -> Evening Reconcile -> Manager Audit.
6. **Accessibility:** Ensure high contrast, readable typefaces (Segoe UI, Inter), and descriptive text.
7. **Cohesive Design & Visual Styling:** Adhere to brand design tokens (Coffee Roast `#2A1B14`, Caramel Bronze `#8A5A36`, crisp borders, and distinct callout blocks).
8. **Feedback Loop:** Establish a direct feedback pipeline for frontline staff to report confusing screens or outdated steps.

---

## 2. User Personas & Role-Based Access Control (RBAC)

KUVENTORY serves four primary operational personas:

- **Persona A: Frontline Crew / Barista:** Operates the front coffee bar and kitchen stations. Enters morning counts, logs ingredient deductions (AM/PM), records waste/spoilage, and conducts evening physical closing counts.
- **Persona B: Bodega Custodian:** Manages the central back-of-house storage warehouse. Receives wholesale deliveries, inspects expiration dates, records Stock-In batches, and tags physical packages.
- **Persona C: Shift Supervisor / Branch Manager:** Audits shift discrepancies, reviews and approves waste tickets, triggers daily shift snapshots, reconfigures stations, and exports PDF/Excel reports for accounting.
- **Persona D: System Administrator:** Manages staff accounts, assigns roles, sets global branch preferences, updates unit costs, and conducts technical database maintenance.

### RBAC Permission Matrix
| Functional Module | Store Crew | Bodega Custodian | Shift Supervisor | System Administrator |
| :--- | :---: | :---: | :---: | :---: |
| Daily Worksheet Entry (AM/PM Usage) | **Full Access** | View Only | **Full Access** | **Full Access** |
| Physical Ending Stock Count Input | **Full Access** | View Only | **Full Access & Override** | **Full Access** |
| Stock-In & FEFO Batch Tagging | Restricted | **Full Access** | **Full Access** | **Full Access** |
| Waste & Spoilage Write-Off Logging | Submit Only | Submit Only | **Approve & Finalize** | **Full Access** |
| Daily Shift Snapshot Creation | No Access | No Access | **Full Access** | **Full Access** |
| Master Catalog Edit & Pricing | View Only | View Only | Restricted Edit | **Full Access** |
| Category & Station Customization | No Access | No Access | **Full Access** | **Full Access** |
| Export Reports (PDF / Excel XLSX) | No Access | No Access | **Full Access** | **Full Access** |
| User Account & Password Admin | No Access | No Access | No Access | **Full Access** |

> [!IMPORTANT]
> **Role Separation Policy:** Crew members must never share login credentials. High-value stock adjustments and waste disposals exceeding 500 PHP strictly require Supervisor PIN or managerial sign-off.

---

## 3. 5-Minute Quick-Start Guide

Get up and running on KUVENTORY in 4 simple steps:

1. **Launch & Authenticate:** Open Google Chrome or Safari on the kiosk tablet or smartphone. Navigate to `https://kuventory.netlify.app`. Enter your assigned Work Email and Password, then click **Sign In to KUVENTORY**. *(Tip: Tap "Add to Home Screen" to install KUVENTORY as a high-speed Progressive Web App).*
2. **Morning Station Inspection:** From the sidebar navigation, tap **Daily Inventory**. Select your operating station tab (e.g., **Bar Station** or **Kitchen**). Verify that the **Beginning Stock** column matches unopened physical units on your shelves.
3. **Log Shift Deductions:** During or immediately after peak service hours (12:00 PM and 6:00 PM), input items used or opened in the **AM Deductions** or **PM Deductions** fields. The system automatically recalculates Expected Stock in real time.
4. **Shift Closing Physical Count:** At closing time (9:30 PM), count all physical units on the station shelves and enter the values into the **Physical Count** column. The system will instantly highlight variances in Green (Balanced) or Red (Shortage). Tap **Save Shift Worksheet** to finalize.

> [!TIP]
> **Speed Shortcut:** Press `Ctrl + K` (or `Cmd + K` on iPad/Mac) anywhere in the application to summon the **Command Palette**. Type any item name, station, or action to jump directly to it without clicking multiple menus.

---

## 4. Standard Operating Procedures (SOPs)

### SOP-01: Shift Opening & Initial Count Verification
- **Purpose:** Ensure opening stock matches yesterday's closing numbers before customer orders commence.
- **Timing:** 30 minutes before store opening (5:30 AM).
- **Procedure:**
  1. Inspect the kiosk tablet, verify battery is charging, and confirm Wi-Fi connectivity.
  2. Log into KUVENTORY and navigate to **Daily Inventory**.
  3. Select your assigned station (**Bar Station**).
  4. Perform a 2-minute spot check on the top 5 high-turnover items: Whole Milk, Espresso Beans, Caramel Syrup, Vanilla Syrup, and 16oz Cups.
  5. Confirm that sealed containers match the **Beginning Stock** column.
  6. If physical stock does not match, do **NOT** edit beginning stock. Click **Add Shift Note** and notify the opening supervisor.

### SOP-02: Receiving Goods & FEFO Batch Tagging (Stock-In)
- **Purpose:** Accurately record incoming wholesale shipments and enforce First-Expired, First-Out (FEFO) rotation.
- **Timing:** Immediately upon supplier delivery truck arrival.
- **Procedure:**
  1. Unload shipment crates onto the receiving counter. Match the physical packages against the Delivery Receipt (DR) and supplier invoice.
  2. Inspect packaging integrity. Immediately reject crushed cartons, unsealed milk jugs, or torn bags.
  3. Open KUVENTORY and tap **Stock-In** -> **New Stock-In Batch**.
  4. Select the item from the catalog dropdown. Enter Quantity Received and Unit Purchase Cost.
  5. Input the Manufacturer Batch Number and Best-Before Expiration Date from the product package.
  6. Affix a physical KUVENTORY color-coded expiration sticker to the boxes. Place new stock **BEHIND** older inventory on the shelves (strict FEFO rotation).

> [!WARNING]
> **The FEFO Rule:** Items with the nearest expiration date MUST always be placed in front and consumed first. Never place fresh deliveries in front of older batches.

### SOP-03: Real-Time Shift Deductions (AM & PM Service)
- **Purpose:** Keep stock levels accurate throughout peak customer rushes to prevent stockouts.
- **Procedure:**
  1. At the conclusion of the morning peak rush (12:00 PM), baristas enter total milk gallons opened and syrup bottles transferred into the **AM Deductions** column.
  2. At the conclusion of the evening peak rush (6:00 PM), staff enter afternoon quantities into the **PM Deductions** column.
  3. Always enter quantities in the designated Unit of Measure (e.g., Bottles, Gallons, Packs). Never enter decimals unless the unit specifies Liters or Kilograms.

### SOP-04: Spoilage, Damage, and Waste Disposal Logging
- **Purpose:** Account for all stock lost to dropped containers, broken glass, customer remakes, or spoiled ingredients.
- **Procedure:**
  1. Never discard damaged or spoiled items into the trash without recording them.
  2. In KUVENTORY **Daily Inventory**, locate the item row and tap **Log Waste / Spoilage**.
  3. Enter the exact quantity lost and select the reason:
     - `Accidental Drop / Spill`
     - `Customer Remake / Order Error`
     - `Expired Past Best-Before Date`
     - `Defective Factory Packaging`
  4. For any loss exceeding 200 PHP in value, take a quick photo using the tablet camera and attach it to the waste ticket.
  5. The shift supervisor reviews and signs off on the waste ticket during the shift closing audit.

### SOP-05: Shift Closing Physical Count & Discrepancy Reconciliation
- **Purpose:** Reconcile actual physical stock against expected inventory to calculate shrinkage and prepare opening stock for tomorrow.
- **Timing:** 30 minutes before store close (9:30 PM).
- **Procedure:**
  1. Count all unopened and opened units present across shelves, undercounter cold storage, and preparation stations.
  2. Enter the numbers into the **Physical Count** column on the Daily Worksheet.
  3. Check the auto-calculated **Discrepancy** column:
     - **Green Badge (0 or positive):** Count balanced or surplus verified.
     - **Red Badge (negative):** Shortage detected. Execute root-cause check:
       - *Check A:* Recount shelf and verify back storage cabinets.
       - *Check B:* Verify if unrecorded waste occurred during rush hours.
       - *Check C:* Check if another station borrowed the item without transfer logging.
  4. Once verified, the Shift Supervisor taps **Finalize Daily Shift & Create Snapshot**. This locks the historical ledger.

---

## 5. Detailed Functional Module Guides

### 5.1 Master Catalog & Category/Station Management
- **Search & Filter:** Find any item in milliseconds using the universal search bar (matches Item Name, SKU, or Barcode). Filter instantly by Station: `All`, `Bar`, `Kitchen`, `Bodega`, `Storage`, `Dining`.
- **Adding Items:** Click `+ Add New Item`. Complete: Item Name, Category, Assigned Station, Unit of Measure (UOM), Minimum Threshold, and Unit Cost.
- **Dual Photo Attachment:** Attach both Front Product Photo and Barcode / Nutrition Label. Images are automatically compressed client-side to WebP format to conserve mobile bandwidth and device storage.

### 5.2 Daily Inventory Shift Worksheet
- **Table vs. Card View:** Use Table View on widescreen desktop PCs; toggle to **Card View** on tablets and smartphones for large touch targets (minimum 44px height).
- **Autosave Protection:** Changes are debounced and transmitted every 500ms. An animated status badge in the top bar confirms: `"Saving..."` -> `"All Changes Saved"`.
- **Color-Coded Status Badges:**
  - `In Stock` (Green): Stock exceeds minimum threshold.
  - `Low Stock` (Amber): Stock is at or below safe buffer.
  - `Out of Stock` (Red): Stock is zero.
  - `Expiring Soon` (Orange): Batch expires within 7 days.

### 5.3 Stock-In & FEFO Expiration Management
- Real-time batch monitoring warns staff before ingredients spoil:
  - **> 30 Days Remaining (Green):** Fresh stock; standard storage.
  - **8 - 30 Days Remaining (Yellow):** Moderate warning; prioritize in daily prep.
  - **1 - 7 Days Remaining (Orange):** Urgent warning; must be consumed this week.
  - **0 Days / Expired (Red Flashing):** Quarantined! Must not be served.

### 5.4 Inventory Snapshots & Audit Reports
- **Snapshot Immutability:** Once a shift snapshot is finalized, historical numbers cannot be overwritten or edited.
- **PDF Export:** Generates clean, printer-optimized audit reports formatted for standard letter/A4 paper and POS thermal printers.
- **Excel XLSX Export:** Generates multi-tab spreadsheets with formulas, category groupings, and monetary valuation for accounting.

---

## 6. Mathematical Equilibrium Formula & Data Dictionary

### 6.1 The Core Inventory Formula
$$\text{Expected Ending Stock} = \text{Beginning Stock} + \text{Stock In} - \text{AM Deductions} - \text{PM Deductions} - \text{Waste}$$

$$\text{Discrepancy (Variance)} = \text{Ending Physical Count} - \text{Expected Ending Stock}$$

$$\text{Variance Monetary Impact (PHP)} = \text{Discrepancy} \times \text{Unit Cost}$$

#### Example Walkthrough (Caramel Syrup 750ml):
1. Beginning Stock: **10 Bottles**
2. Stock-In Delivery: **+ 5 Bottles**
3. AM Usage: **- 3 Bottles**
4. PM Usage: **- 4 Bottles**
5. Waste (1 dropped bottle): **- 1 Bottle**
6. **Expected Ending:** $10 + 5 - 3 - 4 - 1 = \mathbf{7\text{ Bottles}}$
7. Physical Count by Barista: **6 Bottles**
8. **Discrepancy:** $6 - 7 = \mathbf{-1\text{ Bottle (Shortage Alert)}}$

### 6.2 Data Field Dictionary
| Field Name | Type | Description | Validation Rule |
| :--- | :--- | :--- | :--- |
| `item_name` | String | Official commercial name | Required, Max 100 chars |
| `sku` | String | Stock Keeping Unit code | Unique alphanumeric |
| `station` | Enum | Station assignment | Bar, Kitchen, Bodega, Storage |
| `unit_of_measure` | Enum | Counting unit | Bottle, Can, Pack, Kg, L |
| `min_threshold` | Integer | Low-stock threshold | Non-negative integer |
| `unit_cost` | Decimal | Wholesale cost per unit | Non-negative numeric (PHP) |
| `beginning_stock`| Decimal | Stock at shift opening | Carried from prior close |
| `stock_in` | Decimal | Intake received today | Non-negative numeric |
| `am_deductions` | Decimal | Morning consumption | Non-negative numeric |
| `pm_deductions` | Decimal | Evening consumption | Non-negative numeric |
| `waste_quantity`| Decimal | Spoilage / damaged units | Non-negative numeric |
| `physical_count`| Decimal | Actual manual count | Non-negative numeric |
| `discrepancy` | Decimal | Calculated variance | System-generated ($P - E$) |

---

## 7. Troubleshooting & Edge-Case Playbook

| Issue / Symptom | Root Cause | Immediate Action Steps |
| :--- | :--- | :--- |
| **Red Discrepancy Alert** *(Shortage / Negative)* | Physical count is lower than Expected Stock. | 1. Recount shelf and check undercounter cabinets.<br>2. Check if a spill occurred without being logged under Waste.<br>3. Check if Kitchen borrowed stock from Bar without a transfer log.<br>4. Submit count with a detailed discrepancy note. |
| **Yellow Discrepancy Alert** *(Surplus / Positive)* | Physical count is higher than Expected Stock. | 1. Check if a supplier delivery was shelved without entering Stock-In.<br>2. Verify if yesterday's closing count was entered incorrectly.<br>3. Confirm cases were not double-counted as loose bottles. |
| **"Network Offline" Banner** | Wi-Fi connection lost during rush hours. | 1. **DO NOT** refresh or close the browser tab.<br>2. Continue entering counts normally; changes are saved to local device cache.<br>3. The system will auto-sync to the cloud as soon as Wi-Fi reconnects. |
| **Camera / Image Upload Fails** | Camera permission denied or device out of memory. | 1. Tap the lock icon in the browser address bar and set Camera to "Allow".<br>2. Close background applications on the phone/tablet and retry. |
| **Barista Forgot Password** | User locked out before opening shift. | 1. Supervisor logs in with Manager PIN.<br>2. Go to **Settings** -> **User Management** -> Select Barista -> Tap **Send Password Reset**. |

---

## 8. Hardware Hygiene & Best Practices

1. **Screen Sanitation:** Sanitize tablet screens twice daily (opening and closing) using alcohol-free 70% isopropyl wipes. Never spray liquid directly onto the glass.
2. **Moisture Control:** Ensure staff dry hands before operating capacitive touchscreens to prevent erratic input caused by syrup or water droplets.
3. **Thermal Protection:** Position tablet docks at least 1 meter away from espresso machine boilers and high-heat cooking surfaces.
4. **Security Protocol:** Lock terminals whenever stepping away from the counter. Never write passwords on paper notes.

---

## 9. Glossary of Commercial Terms

- **FEFO (First-Expired, First-Out):** Inventory rule mandating that items closest to expiration are rotated to the front and consumed first.
- **SKU (Stock Keeping Unit):** Unique identifier assigned to each product for inventory tracking.
- **Discrepancy (Variance):** Difference between expected computer stock and actual physical shelf count.
- **Safety Stock (Minimum Threshold):** Buffer stock required on hand before a replenishment warning is triggered.
- **Snapshot:** A locked, tamper-proof record of shift counts and monetary valuations at a specific point in time.
- **Shrinkage:** Unexplained inventory reduction due to theft, unrecorded spills, or measurement errors.
- **UOM (Unit of Measure):** Standardized measurement scale used for counting an item (Bottle, Can, Pack, etc.).
- **Bodega:** The central back-of-house storage warehouse where bulk shipments are received and stored.

---

*Authored by Kape Uno Bistro Operations & Technical Quality Assurance Team.*  
*Aligned with the TechSmith User Documentation Creation Framework.*

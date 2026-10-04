# User Personas and UX Research

## 1. Executive Summary & Research Context
KUVENTORY was designed and built to replace fragile paper worksheets, mental calculations, and cluttered spreadsheets in high-volume food service kiosks and central bodega storage facilities. The system bridges the gap between store-level kiosk operations and warehouse inventory management.

---

## 2. Research Insights & Behavioral Data

### Key Behavioral Observations:
1. **Pace & Physical Environment**:
   - Store crew work in fast-paced, grease-prone kiosk environments with wet or gloved hands.
   - Crew members frequently input inventory counts on standard mobile smartphones (Android/iOS) or budget tablets during closing shifts (10:00 PM – 11:30 PM).
   - Typing long descriptions or navigating small touch targets causes significant friction and input errors.
2. **Shift Change Bottlenecks**:
   - Stock counts traditionally took 35–45 minutes using physical paper clipboards. Math errors in beginning stock vs. ending stock caused frequent stockout disputes between AM and PM shifts.
3. **Spoilage & FEFO Gaps**:
   - Before KUVENTORY, staff tended to pull items from the front of the shelf rather than by expiration date, leading to 8–12% food waste in perishable proteins and sauces.

---

## 3. Primary User Personas

### Persona 1: Store Crew / Kiosk Cashier
- **Name**: Maria "Ria" Santos
- **Role**: Kiosk Counter Staff & Cashier
- **Primary Device**: Mid-range smartphone (6.1" display) & 10" POS counter tablet.
- **Goals**:
  - Record daily shift counts (AM/PM sales, stock additions) in under 10 minutes.
  - Avoid complex math; ensure the system auto-calculates ending balances.
  - Quickly scan and verify item codes and stock quantities.
- **Pain Points**:
  - Small, fiddly input boxes that cause typing mistakes.
  - Complicated navigation with too many unnecessary corporate ERP menus.
  - Losing unsaved data when Wi-Fi fluctuates during closing shift counts.
- **Key UX Requirements**:
  - Minimum 40px touch targets for touchscreens.
  - Live autosave indicators with instant visual feedback.
  - Auto-fitting mobile card views with prominent quantity badges.

---

### Persona 2: Bodega Custodian / Kitchen Inventory Supervisor
- **Name**: Marco "Mark" Valdez
- **Role**: Bodega Custodian & Stock Receiver
- **Primary Device**: 11" Android tablet & workstation laptop.
- **Goals**:
  - Log incoming deliveries, assign batch numbers, and register expiration dates.
  - Ensure items are strictly consumed by First-Expired, First-Out (FEFO) rules.
  - Identify low-stock and near-expiry items before opening hours.
- **Pain Points**:
  - Overlooking older stock buried behind new deliveries in deep chillers.
  - Manual batch reconciliation taking hours on spreadsheets.
- **Key UX Requirements**:
  - High-density data table on tablet/desktop for batch tracking.
  - Expiry alert badges (Critical <7 days, Attention <14 days).
  - Quick image upload for item visual identification.

---

### Persona 3: Branch Operations Manager
- **Name**: Elena Cruz
- **Role**: Multi-Store Operations Manager
- **Primary Device**: 14" Laptop & iPhone 15 Pro.
- **Goals**:
  - Review daily finalized inventory reports and historical stock movements.
  - Export audit-ready PDF, Excel, and CSV reports for management meetings.
  - Spot shrinkage, discrepancies, and consumption trends across departments.
- **Pain Points**:
  - Unlocked historical sheets being silently modified after finalization.
  - Unformatted printouts that require manual clean-up in Excel.
- **Key UX Requirements**:
  - Immutable report snapshots that can never be mutated once finalized.
  - Official PDF exports with branded header, metrics summary, and signatures.

---

### Persona 4: System Administrator
- **Name**: David Lim
- **Role**: IT & System Administrator
- **Primary Device**: Desktop Workstation (1920x1080 / 2560x1440).
- **Goals**:
  - Manage user accounts, role permissions (Admin vs Staff), and reset credentials.
  - Monitor audit logs and configure global threshold policies.
- **Key UX Requirements**:
  - Dedicated Administration panel with search, role toggle, and audit timeline.
  - Strict security with clear error feedback and zero secret exposure.

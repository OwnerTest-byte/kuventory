# User Flows and Sitemaps

## 1. Global Application Sitemap

```mermaid
graph TD
    Login["/login (Authentication)"] --> AuthCheck{"Authenticated?"}
    AuthCheck -- "No" --> Login
    AuthCheck -- "Yes" --> Layout["AppLayout (Header, Navigation Rail, Breadcrumbs)"]
    
    Layout --> Dash["/inventory (Dashboard Overview)"]
    Layout --> Daily["/daily-inventory (Daily Worksheet)"]
    Layout --> Catalog["/items (Items Catalog & Stock)"]
    Layout --> Reports["/reports (Reports Library)"]
    Layout --> Notifs["/notifications (Notification Center)"]
    Layout --> Settings["/settings (User Settings & Profile)"]
    Layout --> Admin["/admin (System Administration - Admin Only)"]

    Catalog --> SubCatalog["?tab=catalog (Active & Archived Items)"]
    Catalog --> SubBatches["?tab=batches (FEFO Batches)"]
    Catalog --> SubMovements["?tab=history (Stock Movements Audit)"]
    Catalog --> SubSuppliers["?tab=suppliers (Supplier Directory)"]
    Catalog --> SubCategories["?tab=categories (Category Manager)"]
    Catalog --> ItemDetails["/items/:id (Item Details & History)"]

    Reports --> ReportView["/reports/:id (Snapshot Viewer & PDF/XLSX Export)"]

    Admin --> AdminUsers["?tab=users (User Management & Passwords)"]
    Admin --> AdminEstablishment["?tab=restaurant (Establishment Profile)"]
    Admin --> AdminNotifs["?tab=notifications (Alert Policies)"]
    Admin --> AdminLogs["?tab=logs (System Audit Logs)"]
```

---

## 2. Core User Flows

### Flow 1: Daily Inventory Recording & Finalization (Crew & Manager)

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Store Staff
    participant UI as Daily Inventory Page
    participant Hook as useDailyInventory
    participant DB as Supabase PostgreSQL
    participant Snap as Report Snapshot Engine

    Staff->>UI: Select Worksheet Date (Defaults to Today)
    UI->>Hook: Fetch Session & Entries for Date
    Hook->>DB: Query daily_inventory_sessions
    DB-->>UI: Return 4 Section Tables (Grilled, Portion, Cases, Other)
    
    Staff->>UI: Enter BEG, ADD, SALES AM, SALES PM
    UI->>UI: Auto-calculate TOTAL = BEG + ADD
    UI->>UI: Auto-calculate ENDING = TOTAL - AM - PM
    UI->>DB: Debounced Autosave to daily_inventory_entries
    UI-->>Staff: Visual "Live Autosave" indicator

    Staff->>UI: Click "Finalize Day"
    UI->>UI: Display Finalize Confirmation Dialog
    Staff->>UI: Confirm Finalize
    UI->>DB: Call finalize_daily_inventory(session_id)
    Note over DB: Locks session (status='FINALIZED')<br/>Executes FEFO stock deduction
    DB->>Snap: Generate Immutable Report Snapshot
    Snap-->>UI: Snapshot Created
    UI-->>Staff: Display "Finalized & Locked" Badge
```

---

### Flow 2: Stock Receiving & FEFO Batch Registration

```mermaid
sequenceDiagram
    autonumber
    actor Custodian as Bodega Custodian
    participant UI as Items Catalog / Batches
    participant Modal as Receive Stock Modal
    participant Engine as Stock Engine (Supabase RPC)
    participant DB as PostgreSQL Database

    Custodian->>UI: Click "Receive Stock" / "+ Stock"
    UI->>Modal: Open Stock Update Modal (Action: ADD)
    Custodian->>Modal: Select Item, Enter Qty, Expiry Date, Reason
    Custodian->>Modal: Click "Add Stock"
    Modal->>Engine: Call add_stock_batch(item_id, qty, expiry, reason)
    Engine->>DB: Insert stock_batches (batch_code, expiry_date, quantity)
    Engine->>DB: Insert stock_movements (action_type='ADD')
    Engine->>DB: Update inventory_items current_qty
    DB-->>UI: Return updated balance & new batch
    UI-->>Custodian: Real-time update in catalog & batch list
```

---

### Flow 3: Item Creation with Dual Image Upload (Local or Online)

```mermaid
sequenceDiagram
    autonumber
    actor Staff as User / Manager
    participant Modal as ItemFormModal
    participant ImgComp as ImageUploadInput
    participant Canvas as Client Canvas Compression
    participant API as Inventory API
    participant DB as Supabase

    Staff->>Modal: Click "+ Add New Item"
    Staff->>ImgComp: Choose Image (Local File or Online URL)
    alt Local File Selected
        ImgComp->>Canvas: Compress Image (Max 600px, 82% WebP/JPEG)
        Canvas-->>ImgComp: Compressed Data URL (~40-80KB)
        ImgComp-->>Modal: Update image_path state
    else Online URL Entered
        ImgComp->>ImgComp: Validate HTTPS image link & test preview
        ImgComp-->>Modal: Set online URL as image_path
    end
    Staff->>Modal: Enter SKU, Name, Category, Section, Unit, Min Qty
    Staff->>Modal: Submit Form
    Modal->>API: createItem(payload)
    API->>DB: INSERT INTO inventory_items
    DB-->>Staff: Item created with photo thumbnail rendered
```

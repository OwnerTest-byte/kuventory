# [MASTER ADMIN & SECURITY GOVERNANCE] KUVENTORY™ Absolute Authority Architecture

**System Name:** KUVENTORY Enterprise Restaurant & Kiosk Inventory Management System  
**Document Code:** `DOC-02-MASG`  
**Classification:** Confidential · Tier 0 Master Administrator & Security Governance  
**Production URL:** [https://kuventory.netlify.app](https://kuventory.netlify.app)  
**Version:** 2.4.0 (Production Release)  

---

## 1. System Authority Tiers & Access Matrix

KUVENTORY enforces a strict, cryptographically backed 3-tier authorization hierarchy across the database, backend RPCs, routing, and user interface:

| Attribute | Floor Staff (`USER`) | Store Administrator (`ADMIN`) | Master Administrator (`MASTER_ADMIN`) |
| :--- | :---: | :---: | :---: |
| **System Authority Tier** | Level 2 (Operational) | Level 1 (Administrative) | Tier 0 (Absolute Governance) |
| **Primary Account** | `staff@kuventory.com` | `admin@kuventory.com` | `master@kuventory.com` |
| **Default Password** | `Staff123!` | `Admin123!` | `MasterAdmin2026!` |
| **Sidebar Badge** | *Hidden Completely* | `RESTRICTED` | `ROOT` |
| **Console Access** | No Access | Access Blocked (403 Shield) | Full Access (`/settings?tab=master`) |
| **Daily Worksheet Counting** | ✅ | ✅ | ✅ |
| **Item & Category Management** | ❌ | ✅ | ✅ |
| **Finalize Daily Worksheets** | ❌ | ✅ | ✅ |
| **User Management & Passwords**| ❌ | ✅ (Staff Only) | ✅ (All Accounts) |
| **Real-Time Telemetry** | ❌ | ❌ | ✅ |
| **1-Click Database Snapshots** | ❌ | ❌ | ✅ |
| **Disaster Recovery Restores** | ❌ | ❌ | ✅ |
| **Stock Drift Auto-Healing** | ❌ | ❌ | ✅ |
| **Emergency Maintenance Lock** | ❌ | ❌ | ✅ |
| **Security Mechanism** | RLS User Policies | RLS Admin Policies | `is_master_admin()` Security Definer |

---

## 2. Master Admin Access & Emergency Dispatch Information

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           MASTER ADMINISTRATOR TIER 0                          │
│                                                                                │
│  Account:     master@kuventory.com                                            │
│  Password:    MasterAdmin2026!                                                │
│  Hotline:     09917101298 (Direct Call & SMS Hotline)                         │
│  Route:       /settings?tab=master (Crown Icon in Sidebar)                    │
│  Authority:   Absolute Application Authority, Disaster Recovery & Governance   │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Password Reset Dispatch Protocol
1. When floor staff click **Forgot password?** on the login screen, KUVENTORY dispatches an immediate in-app `PASSWORD_RESET` notification to the Master Admin console.
2. The login screen also displays the emergency direct hotline: **`09917101298`** and contact email **`master@kuventory.com`**.
3. Clicking the reset notification takes the Master Admin directly to the user security console (`/settings?tab=users`) to safely update credentials.

### 2.2 Profile Protection & Role Immutability
A Master Administrator account cannot be demoted, locked out, or deleted by a regular Store Administrator (`ADMIN`). Any attempt by non-master roles to alter a `MASTER_ADMIN` profile is rejected at the database engine level by the PostgreSQL trigger `protect_profile_role()`.

---

## 3. Strict Master Admin vs. Admin Boundary (Zero Trust)

In accordance with KUVENTORY security directives:
1. **Sidebar Visibility:**
   - Both `MASTER_ADMIN` and `ADMIN` see the **Master Admin** entry in the navigation sidebar.
   - For `MASTER_ADMIN`, the item displays a golden crown and `ROOT` badge.
   - For standard `ADMIN`, the item displays a shield and `RESTRICTED` badge.
2. **Access Denial Barrier:**
   - If an `ADMIN` account (`admin@kuventory.com`) clicks the Master Admin link, they are **strictly blocked** by a **403 Access Denied Tier 0 Clearance Barrier**.
   - The barrier displays:
     - Clear rejection message: *"Clearance Denied · Tier 0 Restricted Boundary"*.
     - Detailed explanation of restricted capabilities (Restore, Snapshot, Drift Auto-Heal, Emergency Maintenance).
     - Logged in email, assigned role (`ADMIN`), required role (`MASTER_ADMIN`), and active Zero-Trust policy status.
     - Direct redirect buttons to return safely to the Admin Console or User Management.
   - **Zero Secret/Control Leakage:** No restore buttons, database snapshot triggers, or emergency controls are rendered in the DOM for regular admins.

---

## 4. Master Admin Control Center Capabilities (`/settings?tab=master`)

Accessible exclusively by `master@kuventory.com`, the Master Console provides 6 specialized operational tools:

### 4.1 Real-Time Telemetry & Latency Monitor
- Actively probes PostgREST API and Realtime WebSocket round-trip response times (ms).
- Live health indicators for Database Connection, Auth Engine, Realtime Sync, and Storage Subsystems.

### 4.2 1-Click Live Database Backup Snapshot (Preventive)
- Creates an instant, point-in-time JSON snapshot of the entire KUVENTORY production database.
- Captures all items, categories, batches, movements, daily sheets, daily items, notifications, and profiles.
- Triggers an instant download of `kuventory_master_backup_[timestamp].json` to the Master Admin's local machine.

### 4.3 Disaster Recovery Point-in-Time Restore (Recovery)
- **Safe Dry-Run Inspection:** Before executing any restore, the Master Admin can upload a backup snapshot to generate a discrepancy report showing exact record counts, differences, and affected tables.
- **Confirmation Barrier:** Requires typing the security passphrase to authorize execution.
- **Non-Destructive Restoration:** Upserts and synchronizes records without dropping schema definitions.

### 4.4 Inventory Stock Drift Auto-Healer
- Queries the total sum of all individual active batches in `stock_batches` and compares it against the recorded `current_stock` in `inventory_items`.
- If discrepancies exist (e.g., caused by concurrent edge-case transactions), the Master Admin can click **Reconcile All Drift** to automatically synchronize balances.

### 4.5 Emergency Maintenance Mode Lockdown
- Allows the Master Admin to place KUVENTORY into **Maintenance Mode**.
- While active, non-admin users are shown a polite maintenance overlay preventing new stock mutations while critical database adjustments or migrations are conducted.

### 4.6 Master Audit Trail
- Full chronological ledger recording every high-risk Master Admin action: user role changes, maintenance activations, restore executions, and emergency locks.
- Stored immutably with timestamp, actor email, IP/client metadata, and action parameters.

---

## 5. Security Incident Response Workflow

```
[1. Incident Detected] ──► [2. Contain Account/Session] ──► [3. Audit Inspection] ──► [4. Reconcile / Restore] ──► [5. Verify & Re-Open]
```

1. **Detection:** Notice abnormal stock deductions, unauthorized user creation, or compromised credentials.
2. **Containment:**
   - Log into `master@kuventory.com`.
   - Navigate to `/settings?tab=users` and deactivate the compromised account or reset its password.
   - If severe, activate **Emergency Maintenance Mode** from `/settings?tab=master`.
3. **Investigation:** Inspect `stock_movements` and the Master Audit Trail for unauthorized operations.
4. **Correction:** Perform stock reconciliation via the **Drift Auto-Healer** or restore the database from the last known valid snapshot.
5. **Verification & Post-Mortem:** Verify system integrity, deactivate Maintenance Mode, and document the incident report.

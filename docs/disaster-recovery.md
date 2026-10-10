# KUVENTORY Disaster Recovery & Point-In-Time Restoration Guide

## 1. Overview & Core Philosophy

Disaster Recovery (DR) in KUVENTORY ensures business continuity and data integrity for all physical inventory records across catastrophic failure scenarios. In compliance with Master Engineering Directive Rules 100–128:

- Disaster Recovery and Point-In-Time Restoration is **MASTER ADMIN ONLY**.
- Restoration is **NEVER a single-click accident**: requires explicit checkpoint selection, non-destructive read-only preview, impact analysis, credential verification, and automated pre-restore safety checkpoint capture.
- Production data is never automatically overwritten by automated alarms or blind health triggers.

---

## 2. 5-Tier Recovery Point Architecture (Rule 101)

| Tier | Layer | Mechanism | Retention Class | SLA / RPO |
| :--- | :--- | :--- | :--- | :--- |
| **Layer 1** | Transactional Durability | PostgreSQL WAL (Write-Ahead Logging) + ACID commit | Real-time | RPO: 0 seconds |
| **Layer 2** | Continuous PITR | Cloud Database WAL archiving / Point-In-Time log replay | 14 Days (Continuous) | RPO: < 1 minute |
| **Layer 3** | Application Checkpoints | Application-level Save States (`recovery_points` table catalog) | 14 Days (Frequent) / 180 Days (Daily) | RPO: ~15 minutes |
| **Layer 4** | Long-Term Archive | Encrypted, cold-storage ledger and report snapshots | 12 Months (Monthly) | Long-term Compliance |
| **Layer 5** | Isolated DR Sandbox | Read-only staging environment for pre-flight verification | Ephemeral | Zero Production Risk |

---

## 3. Recovery Point Schema (`public.recovery_points`)

```sql
CREATE TABLE IF NOT EXISTS public.recovery_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  application_version TEXT NOT NULL,
  git_commit TEXT,
  schema_version TEXT NOT NULL,
  state_payload JSONB NOT NULL,
  item_count INT NOT NULL DEFAULT 0,
  batch_count INT NOT NULL DEFAULT 0,
  movement_count INT NOT NULL DEFAULT 0,
  retention_class TEXT NOT NULL CHECK (retention_class IN ('FREQUENT', 'DAILY', 'MONTHLY')),
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'FAILED')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```

---

## 4. Multi-Step Restoration Workflow (Rule 120–122)

Restoration must execute the following sequential protocol without shortcutting:

```text
[1. Select Checkpoint]
         │
         ▼
[2. Read-Only Preview] ────► Verify item counts, batch queues & schema compatibility
         │
         ▼
[3. Show Impact Warning] ──► Explicitly list transactions/data that will be reverted
         │
         ▼
[4. Re-Authenticate] ─────► Master Admin enters password / step-up credentials
         │
         ▼
[5. Safety Point Capture] ─► Create pre-restore safety snapshot of current live state
         │
         ▼
[6. Enter Recovery Mode] ──► Lock concurrent writes to prevent corrupted mutations
         │
         ▼
[7. Authoritative Restore] ─► Restore tables in dependency order within atomic transaction
         │
         ▼
[8. Post-Restore Audit] ───► Verify balances, foreign keys, unread alerts, and exit mode
```

---

## 5. Pre-Restore Safety Checkpoint Rule (Rule 119)

Before applying any restored data over live tables:

- The system automatically triggers `create_recovery_checkpoint()` with `name = 'PRE_RESTORE_SAFETY_SNAPSHOT'` and `is_protected = true`.
- If the administrator selected an incorrect recovery point or needs to undo the restoration, this safety snapshot remains immediately available as a rollback target.

---

## 6. Retention & Automated Cleanup Policy (Rules 105–107)

- **FREQUENT**: Retained for 14 days (automated prune).
- **DAILY**: Retained for 180 days.
- **MONTHLY**: Retained for 12 months (365 days) with immutable compliance lock.
- **NEVER PRUNED**:
  - The latest verified recovery point.
  - Recovery points marked `is_protected = true`.
  - Checkpoints associated with an unresolved incident report.
  - The current pre-restore safety snapshot.

---

## 7. Monthly Auto-Save Engine & 1-Click Point-in-Time Restore

Implemented in `/settings?tab=master` (`MasterRecoveryTab.tsx`):

1. **Automated Monthly Checkpoint Detection:**
   - Detects if a checkpoint exists for the current calendar month (`MONTHLY_AUTOSAVE_YYYY_MM`).
   - If missing, displays an urgent prompt and provides a 1-click **Save Monthly State Now** action.
2. **365-Day Immutable Lock (`is_protected = true`):**
   - Automatically tags monthly checkpoints with immutable protection, preventing deletion by standard prune routines.
3. **Point-In-Time Restore Dialog:**
   - In the save-state inspection dialog, the Master Admin can review the exact state payload (items, categories, batches, counts).
   - Clicking **Restore System to this Checkpoint**:
     1. Automatically captures a `PRE_RESTORE_SAFETY_SNAPSHOT` of current live data.
     2. Restores items and batches to the checkpointed state.
     3. Invalidates all React Query caches to synchronize the frontend immediately.

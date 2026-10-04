# Disaster Recovery & "Save State" Architecture

## 1. Architectural Philosophy: The "Save State" Model
In accordance with Master Engineering Directive Rules 39–59, KUVENTORY implements a disaster recovery architecture modeled on deterministic game save states:
- **Continuous PostgreSQL Durability (Layer 1)**: All committed transactions are durable in write-ahead logs (WAL).
- **Point-in-Time Recovery Reference (Layer 2)**: Recovery timestamps map to coherent database snapshots.
- **Application Recovery Checkpoints (Layer 3)**: Immutable references recorded in `recovery_points` binding application release, Git commit, schema migration version, and database timestamps.
- **Offsite File Backups (Layer 4)**: Immutable JSON archive snapshots exportable via the Backups Center.
- **Isolated Read-Only Previews (Layer 5)**: Safe environments to inspect state before applying any production restore.

---

## 2. Recovery Checkpoint Metadata Specification
Every checkpoint recorded in `public.recovery_points` contains:
```sql
recovery_point_id          UUID PRIMARY KEY
point_code                 TEXT UNIQUE (e.g. RP-20261004-1830-001)
name                       TEXT
description                TEXT
application_version        TEXT (e.g. '2.4.0')
git_commit                 TEXT (e.g. '0545690')
netlify_deploy_id          TEXT
database_recovery_timestamp TIMESTAMPTZ
database_schema_version    TEXT (e.g. '20261004220000')
configuration_version      TEXT
storage_manifest           JSONB
integrity_status           'VERIFIED' | 'WARNING' | 'FAILED' | 'UNKNOWN'
verification_status        'READY' | 'VERIFIED' | 'PROTECTED' | 'EXPIRED'
retention_class            'FREQUENT' | 'DAILY' | 'MONTHLY' | 'INCIDENT_SAFETY'
is_protected               BOOLEAN DEFAULT FALSE
protected_until            TIMESTAMPTZ
```

---

## 3. Tiered Retention & Pruning Safeguards (Rules 43–45)
Retention periods are strictly defined:
- **FREQUENT References**: 14 days retention. Created frequently during operational shifts.
- **DAILY Checkpoints**: 180 days retention. Captured automatically following daily worksheet finalization.
- **MONTHLY Checkpoints**: 365 days retention. Preserved for historical tax and regulatory audit.
- **INCIDENT_SAFETY Checkpoints**: Manually protected, immune from automated cleanup.

### Inviolable Retention Rules (Rule 45)
Automated cleanup executed via `cleanup_expired_recovery_points()` will NEVER delete:
1. The **latest verified recovery point** in the database.
2. Any recovery point with `is_protected = true`.
3. Checkpoints whose `protected_until > NOW()`.
4. Any active pre-restore safety checkpoint.

---

## 4. Read-Only State Preview (Rules 49–53)
Master Admin can inspect any registered checkpoint in the Control Center:
- **Zero-Production-Write Guarantee**: Previews do NOT connect mutating workflows to live production.
- **Metadata Alignment**: Verifies that the frontend version, database schema version, and configuration match.
- **Visual Assurance**: Master Admin can examine what items, batches, and worksheets existed at that exact point in time prior to restoring.

---

## 5. Standard Disaster Restoration Workflow (Rule 57)
Restoration is strictly restricted to `MASTER_ADMIN`:
1. **Identify Checkpoint / Archive**: Select verified recovery point or upload backup JSON archive.
2. **Execute Dry-Run Validation**: System validates JSON schema, verifies checksums, and counts entities (Categories, Items, Batches, Sheets).
3. **Inspect Consequences**: Review differences and affected operational periods.
4. **Create Pre-Restore Safety Checkpoint (Rule 56)**: Current production state is snapshotted immediately before any write.
5. **Activate Emergency Maintenance Mode**: Floor staff are locked to read-only mode to prevent concurrent writes during restore.
6. **Execute Atomic Restore**: Data tables are updated in a single transactional batch.
7. **Post-Restore Integrity Check**: Verify foreign keys, non-negative balances, and FEFO allocations.
8. **Lift Maintenance Mode**: Restore normal floor operations.

# Failure Scenarios, Incident Containment & Recovery Workflows

## 1. Scenario Catalog & Containment Protocols

### Scenario 1: Concurrent Login on Same Account (Rules 11–14, 149)

- **Condition**: Staff member logged in on Terminal 1; second worker attempts login on Tablet 2 using the same credentials.
- **System Action**:
  - Tablet 2 login fails lease acquisition via `claim_user_session`.
  - Tablet 2 session is instantly revoked and cleared.
  - Clear worker-first message displayed: **`ACCOUNT IN USE`** (*Active on another device*).
  - Terminal 1 session is completely undisturbed.
- **Audit**: Incident logged as `SESSION_DENIED_OCCUPIED` with attempted device details.

---

### Scenario 2: Sudden Device Crash / Power Loss (Rules 15, 150)

- **Condition**: Terminal 1 battery dies abruptly without explicit logout.
- **System Action**:
  - Heartbeat stops updating `user_session_leases`.
  - The 45-second lease window elapses.
  - Terminal 2 attempts login after 45 seconds; lease acquisition succeeds atomically.
- **Result**: Zero permanent lockout; graceful stale session recovery.

---

### Scenario 3: Realtime WebSocket Disconnection (Rule 68)

- **Condition**: Network blip or corporate firewall drops Phoenix Realtime WebSocket connection.
- **System Action**:
  - Realtime state indicator transitions to `RECONNECTING` / `DISCONNECTED`.
  - Frontend continues querying PostgreSQL via standard HTTPS/REST.
  - Re-sync occurs automatically upon reconnect without data corruption.
  - System never falsifies connection status as "Connected" when socket is down.

---

### Scenario 4: Network Timeout During Stock Mutation (Rule 34)

- **Condition**: Worker clicks "Deduct 50 units", request reaches server, but response times out due to cellular drop.
- **System Action**:
  - Client catches network failure; does NOT display an optimistic false success.
  - Client prompts worker: *"Network timeout. Verifying transaction status..."*
  - Refetches authoritative stock balance to determine if transaction committed.
  - Prevents accidental double-submission or phantom inventory deductions.

---

### Scenario 5: Lost PDF Export File in Storage (Rules 48, 122)

- **Condition**: Supabase Storage bucket asset is accidentally purged or corrupted.
- **System Action**:
  - System checks immutable `report_items` snapshot table in PostgreSQL.
  - Re-executes server-side report generation directly from the frozen snapshot.
  - Generates a fresh, identical PDF/XLSX export without altering historical numbers.

---

### Scenario 6: Compromised Staff Account (Rule 115)

- **Condition**: Staff account credentials compromised or shared unauthorizedly.
- **Incident Response Workflow**:
  1. Master Admin accesses **Master Admin Control Center → Security**.
  2. Locates target account in Active Session Leases table.
  3. Clicks **Revoke Session**, inputs justification (e.g. "Suspected credential leak").
  4. Lease transitions to `REVOKED`; target device is immediately kicked out.
  5. Master Admin resets account password via Admin User Settings.
  6. Inspects `stock_movements` and `audit_logs` to verify if unauthorized transactions occurred, executing reversal entries if needed.

---

### Scenario 7: Severe Inventory Data Discrepancy (Rules 113, 119)

- **Condition**: Incorrect bulk receiving entered on floor creating inventory confusion.
- **Incident Response Workflow**:
  1. Master Admin activates **Emergency System Maintenance Lockout** to halt floor mutations.
  2. Selects latest verified recovery point in **Disaster Recovery Center**.
  3. Opens **Read-Only State Preview** to examine snapshot values.
  4. Generates an automated Pre-Restore Safety Checkpoint of current state.
  5. Performs atomic restore of verified state or enters explicit reversal transaction.
  6. Re-runs automated database integrity checks.
  7. Lifts Maintenance Mode to restore floor operations.

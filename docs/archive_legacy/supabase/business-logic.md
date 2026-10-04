# Business Logic Architecture

KUVENTORY uses a secure, database-centric business logic architecture.

## Core Principle: No Direct Mutations

The React frontend **MUST NOT** directly `INSERT`, `UPDATE`, or `DELETE` records in sensitive operational tables (e.g., `inventory_balances`, `stock_movements`, `sales`, `purchases`, `cash_transactions`).

Instead, the frontend calls PostgreSQL Remote Procedure Calls (RPCs) which perform the entire operation as an atomic transaction.

## The Validation Pipeline

When the frontend calls an RPC (e.g., `process_sale`), the following pipeline occurs entirely within the PostgreSQL engine:

1.  **Identity Verification**: The RPC uses `auth.uid()` to identify the user executing the transaction.
2.  **Role Verification**: The RPC uses `public.has_any_role()` to verify the user possesses the necessary business role (e.g., Cashier).
3.  **Data Validation**: Input parameters (quantities, prices) are validated to prevent negative or invalid values.
4.  **Business Rules Check**: The RPC verifies that constraints are met (e.g., sufficient stock exists, cash session is open).
5.  **Data Manipulation**: The RPC locks necessary rows (`FOR UPDATE`) and inserts/updates across multiple tables simultaneously.
6.  **Audit Trail**: The RPC generates an entry in the `audit_logs` table.
7.  **Commit/Rollback**: If any step fails, an exception is raised and the entire transaction is rolled back, preventing partial data states.

## Benefits

-   **Data Integrity**: Inventory quantities and financial totals can never go out of sync.
-   **Security**: Bypassing the frontend UI does not allow a malicious user to manipulate stock levels.
-   **Concurrency**: PostgreSQL row locks prevent race conditions when multiple users transact simultaneously.

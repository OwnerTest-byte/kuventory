# Inventory Engine

The KUVENTORY Inventory Engine relies completely on PostgreSQL RPC functions to perform atomic stock operations. This eliminates the possibility of physical stock corruption due to front-end race conditions or network latency.

## Stock Concepts

### 1. Master Data (`inventory_items`)

Stores the catalog definition of an item (name, category, min thresholds). It does *not* hold the live stock counter.

### 2. Live Stock (`stock_batches`)

The true physical inventory. A batch is a quantity of items with a specific `expiry_date` and `received_date`. The total current stock is the sum of all batches.

### 3. Stock Movements (`stock_movements`)

The unalterable, append-only historical log. Every time stock changes (addition, FEFO consumption, manual adjustment), an associated movement log is generated simultaneously within the same database transaction.

## Core Operations

### Add Stock (`add_stock`)

- **Action**: Receives new items.
- **Process**: Inserts a new row into `stock_batches`.
- **History**: Creates an `ADD` movement record.
- **Atomicity**: Single database transaction. Rolls back if the item is archived.

### Remove Stock (`consume_stock`)

- **Action**: Normal operational consumption.
- **Process**: Follows the **FEFO** (First-Expire, First-Out) algorithm.
- **Algorithm**:
  1. Finds all batches for the item.
  2. Sorts them by `expiry_date ASC, received_date ASC`.
  3. Uses `FOR UPDATE` to exclusively lock the rows against parallel requests.
  4. Deducts the required quantity sequentially until the request is fulfilled.
- **History**: Generates a `REMOVE` movement for *each* batch affected.

### Adjust Stock (`adjust_stock`)

- **Action**: Audit corrections, registering damaged goods, or direct batch modifications.
- **Process**: Targets a *specific* batch ID (unlike `consume_stock`).
- **Algorithm**:
  1. Locks the specific batch `FOR UPDATE`.
  2. Updates its quantity to the newly declared absolute amount.
- **History**: Generates an `ADJUST` movement documenting the exact `quantity_change`.

## The View Layer

Because live stock is distributed across batches, we employ PostgreSQL Views to provide simplified data access to the frontend:

- `inventory_stock_view`: A standard view that aggregates batches with `inventory_items` to output a single `total_quantity` per item.
- `stock_history_view`: Enriches the raw `stock_movements` log with human-readable item names and actor (user) profiles.

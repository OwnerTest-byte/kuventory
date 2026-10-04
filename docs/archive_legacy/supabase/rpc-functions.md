# RPC Functions API

## Inventory Module

### `inventory_adjust`
Manually adjusts inventory levels.
- **Parameters**: `p_stock_item_id`, `p_location_id`, `p_adjustment_type` ('IN' or 'OUT'), `p_quantity`, `p_reason`, `p_notes`
- **Roles**: Administrator, Manager, Inventory Staff
- **Action**: Wraps `create_stock_movement` to safely add or deduct stock.

## Purchasing Module

### `create_purchase`
Creates a purchase order in the `ORDERED` status.
- **Parameters**: `p_purchase_number`, `p_supplier_id`, `p_purchase_date`, `p_discount_amount`, `p_payment_method`, `p_notes`, `p_lines_json`
- **Roles**: Administrator, Manager, Inventory Staff

### `receive_purchase`
Receives an `ORDERED` purchase and adds stock to a location.
- **Parameters**: `p_purchase_id`, `p_location_id`
- **Roles**: Administrator, Manager, Inventory Staff
- **Action**: Updates purchase to `RECEIVED` and increments inventory.

## Transfer Module

### `create_stock_transfer`
Initiates a stock transfer between locations, deducting stock from the source immediately.
- **Parameters**: `p_transfer_number`, `p_source_location_id`, `p_destination_location_id`, `p_reason`, `p_notes`, `p_lines_json`
- **Roles**: Administrator, Manager, Inventory Staff

### `complete_stock_transfer`
Completes a transfer, adding stock to the destination.
- **Parameters**: `p_transfer_id`
- **Roles**: Administrator, Manager, Inventory Staff

## POS & Sales Module

### `open_cash_session`
Opens a new cash drawer session for the user.
- **Parameters**: `p_business_date`, `p_opening_cash`
- **Roles**: Administrator, Manager, Cashier

### `close_cash_session`
Closes an open cash session, computing shorts and overs.
- **Parameters**: `p_session_id`, `p_actual_closing_cash`
- **Roles**: Administrator, Manager, Cashier

### `process_sale`
Executes an atomic sale transaction.
- **Parameters**: `p_sale_number`, `p_location_id`, `p_sale_date`, `p_discount_type`, `p_discount_amount`, `p_payment_method`, `p_cash_session_id`, `p_notes`, `p_lines_json`
- **Roles**: Administrator, Manager, Cashier

### `create_expense`
Records a store expense and optionally deducts it from the open cash session.
- **Parameters**: `p_expense_number`, `p_category_id`, `p_supplier_or_payee`, `p_expense_date`, `p_original_amount`, `p_discount_amount`, `p_payment_method`, `p_cash_session_id`, `p_description`, `p_notes`
- **Roles**: Administrator, Manager, Cashier

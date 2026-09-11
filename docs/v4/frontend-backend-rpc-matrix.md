# Frontend ? Backend RPC Match Matrix (v4.0.0)

| RPC | Frontend Arguments | Actual DB Arguments | Return Type | Permission | RLS/Security | Status |
|---|---|---|---|---|---|---|
| create_purchase | p_purchase_number, p_supplier_id, p_purchase_date, p_discount_amount, p_payment_method, p_notes, p_lines_json | Matches perfectly | uuid | uthenticated | SECURITY INVOKER | MATCHED |
| inventory_adjust | p_item_id, p_location_id, p_quantity_change, p_reason, p_notes | Matches perfectly | oid | uthenticated | SECURITY INVOKER | MATCHED |
| create_stock_transfer | p_reference_number, p_from_location_id, p_to_location_id, p_notes, p_lines_json | Matches perfectly | uuid | uthenticated | SECURITY INVOKER | MATCHED |
| complete_stock_transfer | p_transfer_id, p_notes | Matches perfectly | oid | uthenticated | SECURITY INVOKER | MATCHED |
| eceive_purchase | p_purchase_id, p_notes | Matches perfectly | oid | uthenticated | SECURITY INVOKER | MATCHED |
| open_cash_session | p_location_id, p_opening_amount, p_notes | Matches perfectly | uuid | uthenticated | SECURITY INVOKER | MATCHED |
| close_cash_session | p_session_id, p_actual_closing_amount, p_notes | Matches perfectly | oid | uthenticated | SECURITY INVOKER | MATCHED |
| process_sale | p_sale_number, p_location_id, p_sale_date, p_discount_type, p_discount_amount, p_payment_method, p_cash_session_id, p_notes, p_lines_json | Matches perfectly | uuid | uthenticated | SECURITY INVOKER | MATCHED |
| create_expense | p_expense_number, p_category_id, p_supplier_or_payee, p_expense_date, p_original_amount, p_discount_amount, p_payment_method, p_cash_session_id, p_description, p_notes | Matches perfectly | uuid | uthenticated | SECURITY INVOKER | MATCHED |

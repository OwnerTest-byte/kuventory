# Frontend ? Backend Schema Match Matrix (v4.0.0)

| Frontend Feature | Frontend Table/Service | Actual Supabase Table | Columns Match | Relationships Match | Status |
|---|---|---|---|---|---|
| User Management | profiles | profiles | Yes (id, ull_name, ole, etc.) | id -> uth.users | MATCHED |
| Categories | categoryService | categories | Yes | N/A | MATCHED |
| Inventory | inventoryService | stock_items | Yes | category_id -> categories | MATCHED |
| Suppliers | supplierService | suppliers | Yes | N/A | MATCHED |
| Purchases | purchaseService | purchases, purchase_lines | Yes | supplier_id -> suppliers | MATCHED |
| Sales | salesService | sales, sale_lines | Yes | location_id | MATCHED |
| Discounts | discountService (UI only) | discounts (Applied Txns) | UI uses Enum discount_type | UI mapped statically | MATCHED (Enum) |
| Expenses | expenseService | expenses, expense_categories | Yes | category_id | MATCHED |
| Cash Sessions | cashSessionService | cash_sessions, cash_transactions| Yes | opened_by, closed_by | MATCHED |
| Stock Movements | stockMovementService| stock_movements | Yes | stock_item_id | MATCHED |
| Stock Transfers | stockTransferService| stock_transfers, lines | Yes | rom_location, 	o_location | MATCHED |
| Audit Logs | uditService (unused) | udit_logs | N/A | N/A | BACKEND ONLY |
| Notifications | 
otificationService | 
otifications | Mock used | N/A | **MISMATCH (Needs Fix)** |


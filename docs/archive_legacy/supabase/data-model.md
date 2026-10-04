# Supabase Data Model & ER Diagram

This document illustrates the core data model and relationships within the Kuventory system.

## Entity Relationship Diagram

```mermaid
erDiagram
    profiles ||--o{ user_roles : "has"
    roles ||--o{ user_roles : "assigned to"
    
    categories ||--o{ stock_items : "groups"
    units_of_measure ||--o{ stock_items : "measures"
    
    stock_items ||--o{ inventory_balances : "has"
    inventory_locations ||--o{ inventory_balances : "stores"
    
    inventory_locations ||--o{ daily_inventory_periods : "has"
    daily_inventory_periods ||--o{ daily_inventory_lines : "tracks"
    stock_items ||--o{ daily_inventory_lines : "is tracked"
    
    stock_items ||--o{ stock_movements : "undergoes"
    inventory_locations ||--o{ stock_movements : "occurs at"
    
    inventory_locations ||--o{ stock_transfers : "source/destination"
    stock_transfers ||--o{ stock_transfer_lines : "contains"
    stock_items ||--o{ stock_transfer_lines : "moved"
    
    suppliers ||--o| supplier_discount_policies : "has"
    suppliers ||--o{ purchases : "provides"
    purchases ||--o{ purchase_lines : "contains"
    stock_items ||--o{ purchase_lines : "bought"
    
    sales ||--o{ sale_lines : "contains"
    stock_items ||--o{ sale_lines : "sold"
    
    expense_categories ||--o{ expenses : "categorizes"
    
    cash_sessions ||--o{ cash_transactions : "logs"
```

## Relationship Rules
- **Inventory Balance**: A stock item can have exactly one balance per location.
- **Daily Period**: A location can only have one period per business date.
- **Constraints**: Deleting a category or location is generally restricted (`RESTRICT`) if related items exist, enforcing an archive-first strategy.

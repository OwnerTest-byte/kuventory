# Supabase Seed Data

The `supabase/seed.sql` file is used strictly for **Reference Data** required for the application to function correctly. **It does NOT contain mock transactional data**.

## Seeded Entities

### 1. Roles
System-level RBAC definitions:
- Administrator
- Manager
- Inventory Staff
- Cashier
- Kitchen Staff
- Viewer

### 2. Categories
Initial categorization for stock items:
- Grilled (`CAT-GRILL`)
- Portion (`CAT-PORTION`)
- Beverage (`CAT-BEV`)
- Coffee (`CAT-COF`)
- Rice Meals (`CAT-RICE`)
- Snacks (`CAT-SNACK`)
- Frozen Goods (`CAT-FROZ`)
- Packaging (`CAT-PACK`)
- Raw Materials (`CAT-RAW`)
- Condiments (`CAT-COND`)
- Supplies (`CAT-SUP`)

### 3. Units of Measure
Standard measurements:
- pcs, bottle, can, case, box, kg, g, L, mL, pack, tray

### 4. Inventory Locations
Physical tracking locations:
- Bodega (`LOC-BODEGA`)
- Kiosk (`LOC-KIOSK`)
- Grilled (`LOC-GRILLED`)
- Portion (`LOC-PORTION`)

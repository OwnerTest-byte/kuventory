# Wireframes and Layout Architecture

## 1. Responsive Screen Architecture
KUVENTORY employs an adaptive, responsive layout architecture designed to auto-fit any screen size without horizontal cutoffs or awkward collisions:

| Form Factor | Screen Width | Primary Layout Mode | Navigation Pattern |
|---|---|---|---|
| **Mobile Phone** | 320px – 480px | Single-column cards, sticky super-headers | Compact Top Header + Fixed Bottom Bar |
| **Tablet** | 768px – 1024px | 2-column grids, horizontal scrolling ribbons | Collapsible Left Sidebar + Breadcrumbs |
| **Laptop / PC** | 1280px – 1920px+ | High-density 9-column data tables, multi-column analytics | Full-height Collapsible Sidebar + Contextual Actions |

---

## 2. Low-Fidelity Layout Blueprints

### Wireframe A: Mobile Header & Items Catalog (< 768px)

```
+-------------------------------------------------------+
| [Menu] [🟢 BODEGA]                  [🔍] [🌙] [+] [🔔]|  <- Top Header (Anti-Collision)
+-------------------------------------------------------+
| Overview > Items                                      |  <- Breadcrumbs
+-------------------------------------------------------+
| [ Search items, SKU, suppliers...                   ] |  <- Full-width Search
+-----------------------------------+-------------------+
| [Sort: Name (A-Z)       v]        | [All Categories v]|  <- 2-Col Filter Grid
+-----------------------------------+-------------------+
| ( Active: 24 ) ( Archived: 3 ) ( All: 27 )            |  <- Scrollable Filter Pills
+-------------------------------------------------------+
| +---------------------------------------------------+ |
| | [IMG]  BEEF PATTIES 100G              [IN STOCK]  | |
| |        SKU-001  * Kitchen * Portion Stock         | |
| | +-----------------------------------------------+ | |
| | |  Balance: 45 PCS | Unit: ₱35.00 | Min: 10 PCS | | |
| | +-----------------------------------------------+ | |
| | Supplier: Monterey Meats                          | |
| | [View]  [Update Stock]  [Edit]  [Archive] [Delete]| |  <- Touch-friendly Actions (>=40px)
| +---------------------------------------------------+ |
| +---------------------------------------------------+ |
| | [IMG]  BURGER BUNS                    [LOW STOCK] | |
| |        SKU-002  * Bakery * Per Cases             | |
| | +-----------------------------------------------+ | |
| | |  Balance: 5 BOX  | Unit: ₱120.0 | Min: 8 BOX  | | |
| | +-----------------------------------------------+ | |
| | [View]  [Update Stock]  [Edit]  [Archive] [Delete]| |
| +---------------------------------------------------+ |
|                                                       |
|                                                       |
+-------------------------------------------------------+
| [Dash]      [Daily Sheet]    [Items]   [Reports] [More]| <- Fixed Bottom Nav (h-16)
+-------------------------------------------------------+
```

---

### Wireframe B: Desktop High-Density Table (>= 768px)

```
+-------+-----------------------------------------------------------------------------------------+
| LOGO  | [🟢 Location: KUVENTORY KIOSK & BODEGA]   [ Search items, SKU... Ctrl+K ]  [🌙] [+] [🔔] [User]|
+-------+-----------------------------------------------------------------------------------------+
| [|||] | Overview > Items                                                                        |
| Dash  +-----------------------------------------------------------------------------------------+
| Items | [Package Items]  [Layers Batches]  [History Movements]  [Suppliers]  [Categories]       |
| Daily +-----------------------------------------------------------------------------------------+
| Reps  | [ Search item... ]   [Sort v]   [Category v]   ( Active (24) ) ( Archived (3) ) ( All ) |
| Users +-----------------------------------------------------------------------------------------+
| Sett  | ITEM              | SECTION       | COST   | SUPPLIERS  | MIN | BALANCE   | STATUS   | ACT  |
|       |-------------------+---------------+--------+------------+-----+-----------+----------+------|
| [Log] | [img] Beef Patty  | Portion Stock | ₱35.00 | Monterey   | 10  | [45.0 PCS]| IN STOCK | [..] |
|       | [img] Burger Bun  | Per Cases     | ₱120.0 | Gardenia   | 8   | [ 5.0 BOX]| LOW STCK | [..] |
|       | [img] Chicken Qtr | Grilled Stock | ₱85.00 | Bounty Fr. | 15  | [60.0 KG ]| IN STOCK | [..] |
+-------+-----------------------------------------------------------------------------------------+
```

---

### Wireframe C: Daily Inventory Worksheet (Super-Header Table)

```
+-------------------------------------------------------------------------------------------------+
| INVENTORY KIOSK AND BODEGA                 [ Live Autosave ]   [ Preview Report ] [ Finalize Day ]|
| Worksheet Date: [ Sep 09, 2026 v ] [ Sync ]                                                     |
+-------------------------------------------------------------------------------------------------+
| GRILLED STOCK (12 items)                                                                        |
+----+-------------------+-----------+---------------------+-----------------------+---------------+
|    | ITEM IDENTIFIER   | BEGINNING |      STOCK IN       |      DAILY SALES      |    ENDING     |
+----+-------------------+-----------+----------+----------+-----------+-----------+---------------+
| #  | ITEM NAME         | BEG       | ADD      | TOTAL    | SALES AM  | SALES PM  | ENDING BAL    |
+----+-------------------+-----------+----------+----------+-----------+-----------+---------------+
| 1  | Chicken Inasal    | [ 20.00 ] | [ 10.00] |  30.00   | [  8.00 ] | [  7.00 ] |    15.00      |
| 2  | Pork BBQ Skewer   | [ 50.00 ] | [  0.00] |  50.00   | [ 15.00 ] | [ 20.00 ] |    15.00      |
| 3  | Grilled Liempo    | [ 15.00 ] | [  5.00] |  20.00   | [  4.00 ] | [  6.00 ] |    10.00      |
+----+-------------------+-----------+----------+----------+-----------+-----------+---------------+
| Σ  | TOTAL GRILLED     |   85.00   |   15.00  | 100.00   |   27.00   |   33.00   |    40.00      |
+----+-------------------+-----------+----------+----------+-----------+-----------+---------------+
```

# KUVENTORY Design System & Visual Specification

**Artisanal Bistro Aesthetic · Kape Uno Bistro**  
**Version:** 2.0.0  

---

## 1. Design Philosophy & Visual Language

The KUVENTORY interface is crafted around a warm, artisanal coffee and bistro visual language. It balances refined hospitality aesthetics with worker-first operational speed:
- **Low Cognitive Load:** High-contrast data grids, bold variance indicators, and large touch targets (`min-h-[44px]`).
- **Warm & Artisanal Mood:** Elegant serif headers (`Playfair Display`) paired with clean sans-serif UI elements (`Inter` / `Plus Jakarta Sans`).
- **Adaptable Dark & Light Mode:** Tailored HSL color tokens that remain warm, grounded, and legible in both bright daytime and low-lit bistro environments.

---

## 2. Color Palette & Design Tokens

### Core Bistro Palette
| Role | Color Name | Hex Code | HSL Value | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | Burgundy / Wine | `#611A1F` | `355 58% 24%` | Primary buttons, active navigation pills, brand accents |
| **Accent** | Brushed Gold | `#D4AF37` | `43 55% 52%` | High-value badges, Master Admin highlights, stars |
| **Sidebar Rail** | Espresso | `#1F1816` | `15 18% 10%` | Deep roasted espresso sidebar rail and desktop panels |
| **Light BG** | Warm Ivory | `#F6F1EC` | `34 25% 96%` | Canvas background in light mode |
| **Light Card** | Cream Biscuit | `#FAF7F2` | `36 33% 98%` | Card surfaces and elevation containers |
| **Dark BG** | Charcoal Espresso | `#16100E` | `15 20% 8%` | Canvas background in dark mode |
| **Dark Card** | Roasted Taupe | `#221A17` | `16 18% 12%` | Card surfaces in dark mode |

---

## 3. Typography Hierarchy

| Style | Font Family | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Headings (H1/H2)** | Playfair Display | 700 / 800 | Tight | Page titles, Brand hero, Master Admin banners |
| **Body & UI** | Inter / System Sans | 400 / 500 | Normal | Form inputs, table cells, general labels |
| **Numeric & Codes** | JetBrains Mono | 600 / 700 | Normal | SKU codes, variances, batch lot numbers, timestamps |

---

## 4. Responsive Viewport Adaptations

KUVENTORY is engineered and tested across 5 distinct viewport form factors:

1. **Mobile Phones (390x844 / 393x852):**
   - Fixed bottom navigation bar with 44px touch targets.
   - Horizontal scrolling category filters.
   - Collapsible search drawer and stackable summary metrics.
2. **Tablets & iPads (768x1024 / 820x1180):**
   - Adaptive 2-column dashboard grids.
   - Collapsible side navigation rail.
3. **Laptops & Desktops (1280x800 / 1920x1080):**
   - Full 60-character sidebar with expanded navigation.
   - Comprehensive multi-column inventory and audit tables.

# Responsive Cross-Device Engineering & QA Verification Matrix

## 1. Responsive Viewport Test Matrix (Rules 95–97)
KUVENTORY is engineered to provide an adaptive, ergonomic operational interface across all standard retail hardware:

| Form Factor | Viewport Dimensions | Target Hardware Profile | Primary Layout Adaptations |
| :--- | :--- | :--- | :--- |
| **Mobile Compact** | 360 × 800 px | Budget Android handsets | Single-column stacked cards, full-width touch buttons, bottom-drawer navigation. |
| **Mobile Standard** | 390 × 844 px / 393 × 852 px | iPhone 14/15/16, Pixel 7/8 | Dynamic header hiding, floating quick-action buttons, stacked table view. |
| **Mobile Large** | 412 × 915 px | Samsung Galaxy S23/S24+ | Optimized thumb-zone placement for daily stock counts. |
| **Tablet Portrait** | 768 × 1024 px | iPad Mini / 9.7" Retail Tablet | Dual-column summary grids, collapsible sidebar drawer. |
| **Tablet Landscape**| 820 × 1180 px / 1024 × 768 px | iPad Air / Point-of-Sale Dock | High-density tables with pinned action columns. |
| **Laptop** | 1280 × 720 px / 1366 × 768 px | Store Manager Chromebook / PC | Multi-pane administration layout with sticky sub-navigation. |
| **Desktop High-Res**| 1440 × 900 px / 1920 × 1080 px | Master Admin Operations Workstation | Full telemetry grid, expanded telemetry logs, multi-metric charts. |

---

## 2. Mobile Ergonomics & Touch Guidelines (Rules 98–101)

### Virtual Keyboard Clearance & No Trapped Logins (Rule 98)
- The login interface is contained in a vertically scrollable wrapper with `min-h-screen py-8`.
- Fixed height containers (`h-screen overflow-hidden`) are strictly avoided so that on-screen software keyboards never obscure form inputs or the submit button.
- All input fields trigger automatic scroll-into-view upon focus with a 120ms debounce.

### Minimum 48px Touch Targets (Rule 100)
- All primary buttons, quantity steppers, checkbox targets, and modal dismiss buttons enforce a minimum touch bounding box of `min-h-12 min-w-12` (48 × 48 px).
- Table action buttons provide generous touch padding to prevent accidental clicks on adjacent rows.

### Zero Critical Hover Dependencies (Rule 101)
- No essential information, status indicators, or action buttons rely exclusively on CSS `:hover` states.
- All actions are directly tappable or accessible via explicit tap/click toggle menus.

---

## 3. Playwright Real-Browser Verification Results
All viewports verified using automated Playwright browser execution:
- Mobile Safari / WebKit (393 × 852): **PASS**
- Mobile Chrome (412 × 915): **PASS**
- Tablet iPad Landscape (820 × 1180): **PASS**
- Desktop Chromium (1920 × 1080): **PASS**

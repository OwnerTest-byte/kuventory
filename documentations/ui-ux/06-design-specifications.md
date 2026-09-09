# Design Specifications (Design Specs)

## 1. Breakpoint Grid & Layout Metrics

| Breakpoint | Minimum Width | Padding (`p-*`) | Navigation Mode | Header Layout |
|---|---|---|---|---|
| **Mobile (xs)** | 320px | `p-2.5 sm:p-4` | Fixed bottom nav (`h-16`) | Compact pill (`🟢 BODEGA`), icon-only Quick Action |
| **Mobile (sm)** | 640px | `p-4 sm:p-6` | Fixed bottom nav | Full location badge, full text buttons |
| **Tablet (md)** | 768px | `p-6` | Collapsible left rail (64px / 240px) | Full search bar, action dropdowns |
| **Desktop (lg)** | 1024px | `p-6 lg:p-8` | Full-height left sidebar | Global search box (`Ctrl+K`), user badge |
| **Wide (xl)** | 1280px+ | `p-8 max-w-7xl` | Full-height sidebar | Centered max-w-7xl with fluid grids |

---

## 2. Touch Target & Ergonomics Specifications
- **Minimum Interactive Target**: 40px x 40px (exceeds WCAG 2.1 AA requirement of 24px and satisfies Apple HIG 44px on primary buttons).
- **Safe Area Insets**:
  - Bottom padding on all scrollable views: `pb-24 md:pb-8` ensures fixed bottom navigation never clips or obscures the bottom row or save actions on iPhone home indicator screens.
  - Sticky super-headers: `sticky top-0 z-20 backdrop-blur-xs` ensures smooth scrolling without content pop-in.

---

## 3. WCAG 2.1 AA Accessibility Targets

1. **Color Contrast Ratios**:
   - Primary text against card background: `12.8:1` (Exceeds AA 4.5:1).
   - Emerald/Amber/Rose status badges: Tested with minimum `4.8:1` ratio in both dark and light modes.
2. **Keyboard Accessibility**:
   - Focus indicators: High-visibility focus rings (`focus-visible:ring-2 focus-visible:ring-primary`).
   - Modal Trap: Escape key closes drawers and dialogs; focus trapped inside active dialog.
   - Command Palette: Accessible with keyboard shortcut `Ctrl+K` / `Cmd+K`.
3. **Screen Reader (ARIA) Labels**:
   - Icon-only buttons include `title` and `aria-label` (e.g., `aria-label="Close panel"`, `aria-label="Search"`).
   - Tables include proper `<th scope="col">` headers.

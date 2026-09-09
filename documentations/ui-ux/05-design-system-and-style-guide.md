# Design System and Style Guide

## 1. Design Principles
1. **High Contrast & Readability**: Crystal clear numbers, sharp tabular data, and prominent status pills for fast-paced commercial kitchens and bodega lighting.
2. **Zero Clutter**: Functional UI only. Every element serves an inventory, stock, or reporting purpose.
3. **Adaptive Responsiveness**: Identical business capability across desktop, tablet, and mobile with layout adaptations tailored to the form factor.
4. **Dark & Light Mode Parity**: Seamless HSL color token switching with zero contrast degradation in dark environments.

---

## 2. Color System (HSL Tailored Tokens)

### Light Mode Palette
| Token Name | HSL Value | Hex Equivalent | Usage |
|---|---|---|---|
| `--background` | `0 0% 100%` | `#FFFFFF` | Primary application background |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card surfaces & floating sheets |
| `--foreground` | `222.2 84% 4.9%` | `#020817` | High-contrast body text & titles |
| `--muted` | `210 40% 96.1%` | `#F1F5F9` | Table header rows, tag backgrounds |
| `--primary` | `221.2 83.2% 53.3%` | `#2563EB` | Primary buttons, active tabs, brand accents |
| `--border` | `214.3 31.8% 91.4%` | `#E2E8F0` | Table borders, card outlines |
| `--emerald` | `142 76% 36%` | `#16A34A` | In Stock, Finalized, Success badges |
| `--amber` | `38 92% 50%` | `#F59E0B` | Low Stock, Expiring Soon warnings |
| `--rose` | `346 87% 53%` | `#E11D48` | Out of Stock, Expired, Destructive buttons |

### Dark Mode Palette
| Token Name | HSL Value | Hex Equivalent | Usage |
|---|---|---|---|
| `--background` | `222.2 84% 4.9%` | `#020817` | Deep slate dark background |
| `--card` | `222.2 84% 7%` | `#090E1A` | Elevated card surfaces |
| `--foreground` | `210 40% 98%` | `#F8FAFC` | Crisp white text |
| `--muted` | `217.2 32.6% 17.5%` | `#1E293B` | Dark table headers & active pills |
| `--border` | `217.2 32.6% 17.5%` | `#1E293B` | Subtle dark dividers |

---

## 3. Typography Scale

- **Font Family**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Monospace Family**: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace (used for all numeric quantities, SKU codes, currency, and timestamps).

| Scale Token | Font Size | Line Height | Font Weight | Typical Usage |
|---|---|---|---|---|
| `text-[10px]` | 10px / 0.625rem | 14px | Bold / SemiBold | Super-headers, badges, table column labels |
| `text-xs` | 12px / 0.75rem | 16px | Medium / Bold | Table body cells, dropdowns, input text |
| `text-sm` | 14px / 0.875rem | 20px | Regular / Bold | Breadcrumbs, modal body, button labels |
| `text-base` | 16px / 1rem | 24px | Bold | Section titles, sidebar brand |
| `text-xl` | 20px / 1.25rem | 28px | ExtraBold | Page titles, hero banners |
| `text-2xl` | 24px / 1.5rem | 32px | Black | Dashboard primary KPI figures |

---

## 4. Reusable UI Component Specifications

### Buttons (`Button.tsx`)
- `variant="default"`: High-priority action (`bg-primary text-primary-foreground`).
- `variant="outline"`: Secondary action (`border border-border bg-card hover:bg-muted`).
- `variant="ghost"`: Low-profile toolbar action (`hover:bg-muted text-muted-foreground`).
- `variant="destructive"`: Permanent deletes or archives (`bg-destructive text-destructive-foreground`).

### Status Badges (`Badge.tsx`)
- **In Stock**: `bg-emerald-500/10 text-emerald-600 border border-emerald-500/20`
- **Low Stock**: `bg-amber-500/10 text-amber-600 border border-amber-500/20`
- **Out of Stock**: `bg-rose-500/10 text-rose-600 border border-rose-500/20`
- **Archived**: `bg-muted text-muted-foreground border border-border`

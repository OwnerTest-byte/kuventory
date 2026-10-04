# UI / UX Guidelines

**Kuventory v2.0.0**

## Core Philosophy
The interface is designed to be highly functional and strictly utilitarian, reflecting the fast-paced environment of a restaurant backend. It focuses on:
- High contrast and legibility.
- Minimizing clicks for common operations.
- Clear status indicators (e.g., success, warning, destructive).
- Data density without overwhelming the user.

## Color Palette
The color system is managed via CSS variables in `index.css`, driven by Tailwind CSS and `next-themes`.

### Dark Mode (Primary Focus)
Kuventory is designed with a **Dark Mode First** philosophy, as it reduces eye strain in dimly lit backend office environments.
- **Background**: Deep gray/black (`#09090b`)
- **Card/Surface**: Slightly lighter gray (`#121214`)
- **Text (Primary)**: Off-white (`#fafafa`)
- **Text (Muted)**: Gray (`#a1a1aa`)
- **Primary Brand (Action)**: Muted Gold/Amber (`#d97706` or similar)
- **Destructive**: Soft Red (`#ef4444`)
- **Success**: Soft Green (`#22c55e`)
- **Warning**: Yellow/Orange (`#eab308`)

### Light Mode
- **Background**: Pure white (`#ffffff`)
- **Card/Surface**: Off-white (`#fafafa`)
- **Text (Primary)**: Near black (`#09090b`)

## Typography
- **Font Family**: Primary interface utilizes a sans-serif stack (system fonts or Inter).
- **Headings**: Bold, tight tracking. `text-2xl` or `text-3xl` for page headers.
- **Body**: standard `text-sm` for most tables and UI elements to increase data density.
- **Monospace**: `font-mono` used strictly for IDs, transaction numbers, and codes (e.g., `TRX-1234`).

## Spacing & Layout Rules
- **Container Max-Width**: `max-w-7xl` centered with `mx-auto`.
- **Padding**: Mobile gets `p-4`, tablets `p-6`, desktop `p-8`.
- **Gaps**: Standard gap between flex/grid items is `gap-4` or `gap-6`.

## Responsive Design Rules
- **Mobile (< 640px)**: 
  - Sidebar collapses into a hamburger menu (Mobile Drawer).
  - Search bar collapses into an icon.
  - Data tables must have `overflow-x-auto` to allow horizontal scrolling without breaking the layout.
  - Grid layouts default to `grid-cols-1`.
- **Tablet (640px - 1024px)**: 
  - Sidebar can be collapsed to icons only.
  - Grid layouts expand to `grid-cols-2`.
- **Desktop (> 1024px)**: 
  - Sidebar is expanded by default.
  - Full search bar is visible.
  - Complex charts and grids take full advantage of screen real estate (`grid-cols-3` or `grid-cols-4`).

## Focus & Accessibility
- All interactive elements must have a visible focus ring (`focus-visible:ring-2 focus-visible:ring-ring`).
- Icon-only buttons must utilize `aria-label` or include a visually hidden `<span className="sr-only">`.
- Color contrast ratios must meet WCAG AA standards.
